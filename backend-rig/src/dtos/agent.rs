use serde::Deserialize;

#[derive(Deserialize)]
pub struct AgentRequest {
    pub query: String,
    pub session_id: Option<String>,
    pub stream: bool,
}
