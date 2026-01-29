use axum::{
    Router,
    extract::{Json, State},
    routing::{get, post},
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

mod models;
use crate::models::{ChatRequest, ChatResponse, HealthResponse};

use rig::completion::Prompt;
use rig::prelude::*;
use rig::providers::gemini;

struct AppState {
    gemini_client: gemini::Client,
}

async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
    })
}

async fn chat_handler(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ChatRequest>,
) -> Json<ChatResponse> {
    tracing::info!("Chat request received: {}", request.message);

    let mut preamble =
        "WAJIB: Selalu jawab dalam Bahasa Indonesia kecuali diminta lain.".to_string();
    if let Some(instruction) = &request.custom_instruction {
        preamble.push_str(&format!("\n\nINSTRUKSI TAMBAHAN: {}", instruction));
    }

    // Initialize agent with model and preamble
    let agent = state
        .gemini_client
        .agent(gemini::completion::GEMINI_2_5_FLASH)
        .preamble(&preamble)
        .build();

    // Prompt the agent and handle the response
    match agent.prompt(&request.message).await {
        Ok(response) => Json(ChatResponse {
            response,
            prompt_tokens: None,
            response_tokens: None,
            total_tokens: None,
        }),
        Err(e) => {
            tracing::error!("Rig error: {}", e);
            Json(ChatResponse {
                response: format!("Error from AI service: {}", e),
                prompt_tokens: None,
                response_tokens: None,
                total_tokens: None,
            })
        }
    }
}

#[tokio::main]
async fn main() {
    // Load .env file if exists
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Initialize Gemini client from environment
    let gemini_client = gemini::Client::from_env();

    // Create shared state
    let state = Arc::new(AppState { gemini_client });

    // Configure CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build the router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/chat", post(chat_handler))
        .with_state(state)
        .layer(cors);

    // Bind to port 3000
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!("Server running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
