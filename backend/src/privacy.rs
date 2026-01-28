use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SanitizedContext {
    pub url: Option<String>,
    pub title: Option<String>,
    pub content: Option<String>,
    pub screenshot: Option<String>,
}

/// Sanitize text by redacting sensitive information
pub fn sanitize_text(text: &str) -> String {
    let mut result = text.to_string();

    // Email pattern
    let email_regex = Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}").unwrap();
    result = email_regex
        .replace_all(&result, "[EMAIL_REDACTED]")
        .to_string();

    // Credit card pattern (13-16 digits with optional spaces/dashes)
    let cc_regex = Regex::new(r"\b(?:\d[ -]*?){13,16}\b").unwrap();
    result = cc_regex.replace_all(&result, "[CC_REDACTED]").to_string();

    // Phone number patterns
    let phone_regex = Regex::new(r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b").unwrap();
    result = phone_regex
        .replace_all(&result, "[PHONE_REDACTED]")
        .to_string();

    // SSN pattern
    let ssn_regex = Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap();
    result = ssn_regex.replace_all(&result, "[SSN_REDACTED]").to_string();

    result
}

/// Sanitize a context object
pub fn sanitize_context(context: &crate::ws::ContextUpdate) -> SanitizedContext {
    SanitizedContext {
        url: context.url.clone(),
        title: context.title.as_ref().map(|t| sanitize_text(t)),
        content: context.content.as_ref().map(|c| sanitize_text(c)),
        screenshot: context.screenshot.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_redaction() {
        let input = "Contact me at john.doe@example.com for more info";
        let result = sanitize_text(input);
        assert_eq!(result, "Contact me at [EMAIL_REDACTED] for more info");
    }

    #[test]
    fn test_credit_card_redaction() {
        let input = "My card number is 4111 1111 1111 1111";
        let result = sanitize_text(input);
        assert!(result.contains("[CC_REDACTED]"));
    }

    #[test]
    fn test_phone_redaction() {
        let input = "Call me at 555-123-4567";
        let result = sanitize_text(input);
        assert_eq!(result, "Call me at [PHONE_REDACTED]");
    }

    #[test]
    fn test_ssn_redaction() {
        let input = "SSN: 123-45-6789";
        let result = sanitize_text(input);
        assert_eq!(result, "SSN: [SSN_REDACTED]");
    }

    #[test]
    fn test_multiple_redactions() {
        let input = "Email: test@test.com, Phone: 555-555-5555";
        let result = sanitize_text(input);
        assert!(result.contains("[EMAIL_REDACTED]"));
        assert!(result.contains("[PHONE_REDACTED]"));
    }
}
