use std::path::Path;
use std::sync::Mutex;

use chrono::Utc;
use rusqlite::{params, Connection, Row};
use thiserror::Error;

use crate::models::{BacklogCount, HopperItem, ItemStatus, ItemType, NewItem};

#[derive(Debug, Error)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("unknown status in DB: {0}")]
    UnknownStatus(String),
    #[error("unknown type in DB: {0}")]
    UnknownType(String),
}

pub type DbResult<T> = Result<T, DbError>;

pub struct Db {
    pub conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> DbResult<Self> {
        let conn = Connection::open(path)?;
        initialize_schema(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    #[cfg(test)]
    pub fn open_in_memory() -> DbResult<Self> {
        let conn = Connection::open_in_memory()?;
        initialize_schema(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

const SCHEMA_V2: &str = r#"
    CREATE TABLE IF NOT EXISTS items (
        id           TEXT PRIMARY KEY,
        title        TEXT NOT NULL,
        note         TEXT,
        type         TEXT NOT NULL CHECK (type IN ('url','image','text_snippet','file','note')),
        content      TEXT,
        file_path    TEXT,
        tags         TEXT NOT NULL DEFAULT '[]',
        status       TEXT NOT NULL CHECK (status IN ('backlog','important','reviewed','dig_deeper')),
        created_at   TEXT NOT NULL,
        reviewed_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_items_status      ON items(status);
    CREATE INDEX IF NOT EXISTS idx_items_created_at  ON items(created_at);
"#;

/// v1 → v2 migration: widens the status CHECK constraint to include 'dig_deeper'.
/// SQLite can't alter a CHECK in place; we rebuild the table preserving data.
const MIGRATE_V1_TO_V2: &str = r#"
    CREATE TABLE items_v2 (
        id           TEXT PRIMARY KEY,
        title        TEXT NOT NULL,
        note         TEXT,
        type         TEXT NOT NULL CHECK (type IN ('url','image','text_snippet','file','note')),
        content      TEXT,
        file_path    TEXT,
        tags         TEXT NOT NULL DEFAULT '[]',
        status       TEXT NOT NULL CHECK (status IN ('backlog','important','reviewed','dig_deeper')),
        created_at   TEXT NOT NULL,
        reviewed_at  TEXT
    );
    INSERT INTO items_v2 (id, title, note, type, content, file_path, tags, status, created_at, reviewed_at)
        SELECT id, title, note, type, content, file_path, tags, status, created_at, reviewed_at FROM items;
    DROP TABLE items;
    ALTER TABLE items_v2 RENAME TO items;
    CREATE INDEX IF NOT EXISTS idx_items_status      ON items(status);
    CREATE INDEX IF NOT EXISTS idx_items_created_at  ON items(created_at);
"#;

fn initialize_schema(conn: &Connection) -> DbResult<()> {
    let version: u32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    match version {
        0 => {
            // Fresh DB — create directly at v2 schema.
            conn.execute_batch(SCHEMA_V2)?;
            conn.execute_batch("PRAGMA user_version = 2;")?;
        }
        1 => {
            // Existing DB from pre-DigDeeper era — migrate in place.
            conn.execute_batch(MIGRATE_V1_TO_V2)?;
            conn.execute_batch("PRAGMA user_version = 2;")?;
        }
        _ => {
            // v2 or newer — nothing to do.
        }
    }
    Ok(())
}

fn row_to_item(row: &Row<'_>) -> rusqlite::Result<(String, String, Option<String>, String, Option<String>, Option<String>, String, String, String, Option<String>)> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
    ))
}

fn decode_row(row: &Row<'_>) -> DbResult<HopperItem> {
    let (id, title, note, type_str, content, file_path, tags_json, status_str, created_at, reviewed_at) =
        row_to_item(row)?;

    let tags: Vec<String> = serde_json::from_str(&tags_json)?;
    let item_type = ItemType::from_str(&type_str).ok_or(DbError::UnknownType(type_str))?;
    let status = ItemStatus::from_str(&status_str).ok_or(DbError::UnknownStatus(status_str))?;

    Ok(HopperItem {
        id,
        title,
        note,
        item_type,
        content,
        file_path,
        tags,
        status,
        created_at,
        reviewed_at,
    })
}

pub fn create_item(db: &Db, new_item: NewItem) -> DbResult<HopperItem> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&new_item.tags)?;

    let item = HopperItem {
        id: id.clone(),
        title: new_item.title,
        note: new_item.note,
        item_type: new_item.item_type,
        content: new_item.content,
        file_path: new_item.file_path,
        tags: new_item.tags,
        status: new_item.status,
        created_at: created_at.clone(),
        reviewed_at: None,
    };

    let conn = db.conn.lock().expect("db mutex poisoned");
    conn.execute(
        r#"
        INSERT INTO items (id, title, note, type, content, file_path, tags, status, created_at, reviewed_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)
        "#,
        params![
            item.id,
            item.title,
            item.note,
            item.item_type.as_str(),
            item.content,
            item.file_path,
            tags_json,
            item.status.as_str(),
            item.created_at,
        ],
    )?;
    Ok(item)
}

pub fn get_items(db: &Db, filter: Option<ItemStatus>) -> DbResult<Vec<HopperItem>> {
    let conn = db.conn.lock().expect("db mutex poisoned");
    // Sort: Important first, then Dig Deeper, then Backlog, Reviewed/Not Needed last.
    // Within each bucket, newest first.
    let sort = "ORDER BY \
        CASE status \
            WHEN 'important' THEN 0 \
            WHEN 'dig_deeper' THEN 1 \
            WHEN 'backlog' THEN 2 \
            ELSE 3 \
        END ASC, \
        created_at DESC";

    let items: Vec<HopperItem> = match filter {
        Some(status) => {
            let mut stmt = conn.prepare(&format!(
                "SELECT id, title, note, type, content, file_path, tags, status, created_at, reviewed_at \
                 FROM items WHERE status = ?1 {sort}"
            ))?;
            let rows = stmt.query_map(params![status.as_str()], |row| Ok(decode_row(row)))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
                .into_iter()
                .collect::<DbResult<Vec<_>>>()?
        }
        None => {
            // "All" excludes 'reviewed' (Not Needed) — those are triaged out of view.
            let mut stmt = conn.prepare(&format!(
                "SELECT id, title, note, type, content, file_path, tags, status, created_at, reviewed_at \
                 FROM items WHERE status != 'reviewed' {sort}"
            ))?;
            let rows = stmt.query_map([], |row| Ok(decode_row(row)))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
                .into_iter()
                .collect::<DbResult<Vec<_>>>()?
        }
    };
    Ok(items)
}

pub fn update_item_status(db: &Db, id: &str, status: ItemStatus) -> DbResult<()> {
    let conn = db.conn.lock().expect("db mutex poisoned");
    let reviewed_at = if matches!(status, ItemStatus::Reviewed) {
        Some(Utc::now().to_rfc3339())
    } else {
        None
    };
    conn.execute(
        "UPDATE items SET status = ?1, reviewed_at = ?2 WHERE id = ?3",
        params![status.as_str(), reviewed_at, id],
    )?;
    Ok(())
}

pub fn update_item(db: &Db, item: &HopperItem) -> DbResult<()> {
    let tags_json = serde_json::to_string(&item.tags)?;
    let conn = db.conn.lock().expect("db mutex poisoned");
    conn.execute(
        r#"
        UPDATE items SET
            title = ?1, note = ?2, type = ?3, content = ?4, file_path = ?5,
            tags = ?6, status = ?7, reviewed_at = ?8
        WHERE id = ?9
        "#,
        params![
            item.title,
            item.note,
            item.item_type.as_str(),
            item.content,
            item.file_path,
            tags_json,
            item.status.as_str(),
            item.reviewed_at,
            item.id,
        ],
    )?;
    Ok(())
}

pub fn delete_item(db: &Db, id: &str) -> DbResult<()> {
    let conn = db.conn.lock().expect("db mutex poisoned");
    conn.execute("DELETE FROM items WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_item(db: &Db, id: &str) -> DbResult<Option<HopperItem>> {
    let conn = db.conn.lock().expect("db mutex poisoned");
    let mut stmt = conn.prepare(
        "SELECT id, title, note, type, content, file_path, tags, status, created_at, reviewed_at \
         FROM items WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| Ok(decode_row(row)))?;
    match rows.next() {
        Some(r) => Ok(Some(r??)),
        None => Ok(None),
    }
}

pub fn get_all_tags(db: &Db) -> DbResult<Vec<String>> {
    let conn = db.conn.lock().expect("db mutex poisoned");
    let mut stmt = conn.prepare("SELECT tags FROM items")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

    use std::collections::BTreeSet;
    let mut all: BTreeSet<String> = BTreeSet::new();
    for row in rows {
        let tags_json = row?;
        let tags: Vec<String> = serde_json::from_str(&tags_json)?;
        all.extend(tags);
    }
    Ok(all.into_iter().collect())
}

pub fn get_backlog_count(db: &Db) -> DbResult<BacklogCount> {
    let conn = db.conn.lock().expect("db mutex poisoned");
    let important: u32 = conn.query_row(
        "SELECT COUNT(*) FROM items WHERE status = 'important'",
        [],
        |row| row.get(0),
    )?;
    let ill_get_to: u32 = conn.query_row(
        "SELECT COUNT(*) FROM items WHERE status = 'backlog'",
        [],
        |row| row.get(0),
    )?;
    Ok(BacklogCount {
        total: important + ill_get_to,
        important,
        ill_get_to,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_new_item() -> NewItem {
        NewItem {
            title: "Test URL".into(),
            note: Some("why I want to read this".into()),
            item_type: ItemType::Url,
            content: Some("https://example.com".into()),
            file_path: None,
            tags: vec!["learning".into(), "rust".into()],
            status: ItemStatus::Backlog,
        }
    }

    #[test]
    fn roundtrip_create_read_delete() {
        let db = Db::open_in_memory().expect("open in-memory db");

        // create
        let created = create_item(&db, sample_new_item()).expect("create");
        assert_eq!(created.title, "Test URL");
        assert!(!created.id.is_empty());
        assert_eq!(created.tags, vec!["learning", "rust"]);

        // read via get_items (no filter)
        let all = get_items(&db, None).expect("get_items none");
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, created.id);
        assert_eq!(all[0].item_type, ItemType::Url);

        // read via filter
        let backlog = get_items(&db, Some(ItemStatus::Backlog)).expect("get_items backlog");
        assert_eq!(backlog.len(), 1);
        let reviewed = get_items(&db, Some(ItemStatus::Reviewed)).expect("get_items reviewed");
        assert_eq!(reviewed.len(), 0);

        // update status to important
        update_item_status(&db, &created.id, ItemStatus::Important).expect("update status");
        let counts = get_backlog_count(&db).expect("backlog count");
        assert_eq!(counts.total, 1);
        assert_eq!(counts.important, 1);
        assert_eq!(counts.ill_get_to, 0);

        // mark reviewed -> reviewed_at populated
        update_item_status(&db, &created.id, ItemStatus::Reviewed).expect("mark reviewed");
        // "All" (None filter) excludes reviewed items — fetch explicitly.
        let after = get_items(&db, Some(ItemStatus::Reviewed)).expect("get_items reviewed");
        assert_eq!(after.len(), 1);
        assert!(after[0].reviewed_at.is_some());

        let none_after = get_items(&db, None).expect("get_items none after review");
        assert!(
            none_after.is_empty(),
            "reviewed items should not appear in None filter"
        );

        let counts_after = get_backlog_count(&db).expect("backlog count after review");
        assert_eq!(counts_after.total, 0); // reviewed items don't count

        // delete
        delete_item(&db, &created.id).expect("delete");
        let empty = get_items(&db, None).expect("get_items empty");
        assert!(empty.is_empty());
    }

    #[test]
    fn ordering_important_first() {
        let db = Db::open_in_memory().expect("open db");
        let _a = create_item(
            &db,
            NewItem {
                title: "first backlog".into(),
                note: None,
                item_type: ItemType::Note,
                content: None,
                file_path: None,
                tags: vec![],
                status: ItemStatus::Backlog,
            },
        )
        .unwrap();
        let b = create_item(
            &db,
            NewItem {
                title: "second, important".into(),
                note: None,
                item_type: ItemType::Note,
                content: None,
                file_path: None,
                tags: vec![],
                status: ItemStatus::Important,
            },
        )
        .unwrap();

        let all = get_items(&db, None).unwrap();
        assert_eq!(all[0].id, b.id, "important should sort before backlog");
    }

    #[test]
    fn dig_deeper_status_roundtrips() {
        let db = Db::open_in_memory().expect("open db");
        let item = create_item(&db, sample_new_item()).unwrap();
        update_item_status(&db, &item.id, ItemStatus::DigDeeper).expect("mark dig_deeper");

        let dig = get_items(&db, Some(ItemStatus::DigDeeper)).unwrap();
        assert_eq!(dig.len(), 1);
        assert_eq!(dig[0].status, ItemStatus::DigDeeper);

        // DigDeeper items still appear in the "All" (None) filter.
        let all = get_items(&db, None).unwrap();
        assert_eq!(all.len(), 1);
    }
}
