use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    Backlog,
    Important,
    /// Displayed as "Not Needed" in the UI. Kept as 'reviewed' in the DB for
    /// schema compatibility — the rename is display-only.
    Reviewed,
    DigDeeper,
}

impl ItemStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            ItemStatus::Backlog => "backlog",
            ItemStatus::Important => "important",
            ItemStatus::Reviewed => "reviewed",
            ItemStatus::DigDeeper => "dig_deeper",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "backlog" => Some(ItemStatus::Backlog),
            "important" => Some(ItemStatus::Important),
            "reviewed" => Some(ItemStatus::Reviewed),
            "dig_deeper" => Some(ItemStatus::DigDeeper),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemType {
    Url,
    Image,
    TextSnippet,
    File,
    Note,
}

impl ItemType {
    pub fn as_str(self) -> &'static str {
        match self {
            ItemType::Url => "url",
            ItemType::Image => "image",
            ItemType::TextSnippet => "text_snippet",
            ItemType::File => "file",
            ItemType::Note => "note",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "url" => Some(ItemType::Url),
            "image" => Some(ItemType::Image),
            "text_snippet" => Some(ItemType::TextSnippet),
            "file" => Some(ItemType::File),
            "note" => Some(ItemType::Note),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HopperItem {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(rename = "type")]
    pub item_type: ItemType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    pub tags: Vec<String>,
    pub status: ItemStatus,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_at: Option<String>,
}

/// Payload for creating a new item. id, created_at, and default status are assigned server-side.
#[derive(Debug, Clone, Deserialize)]
pub struct NewItem {
    pub title: String,
    pub note: Option<String>,
    #[serde(rename = "type")]
    pub item_type: ItemType,
    pub content: Option<String>,
    pub file_path: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_status")]
    pub status: ItemStatus,
}

fn default_status() -> ItemStatus {
    ItemStatus::Backlog
}

#[derive(Debug, Clone, Serialize)]
pub struct BacklogCount {
    pub total: u32,
    pub important: u32,
    pub ill_get_to: u32,
}
