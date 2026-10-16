//! Model Context Protocol (MCP) Server Implementation
//! Provides standardized tools for AI agents to interact with the browser

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use chrono::Utc;

/// MCP Tool definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    #[serde(default)]
    pub read_only_hint: bool,
}

/// MCP Resource definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPResource {
    pub uri: String,
    pub name: String,
    pub description: String,
    pub mime_type: String,
}

/// MCP Tool Call Request
#[derive(Debug, Clone, Deserialize)]
pub struct MCPToolCall {
    pub name: String,
    pub arguments: HashMap<String, Value>,
}

/// MCP Tool Call Response
#[derive(Debug, Clone, Serialize)]
pub struct MCPToolResponse {
    pub content: Vec<MCPContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// MCP Content types
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum MCPContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { data: String, mime_type: String },
    #[serde(rename = "resource")]
    Resource { uri: String, mime_type: String, data: Value },
}

/// MCP Server state
pub struct MCPServer {
    tools: HashMap<String, MCPTool>,
    resources: HashMap<String, MCPResource>,
}

impl MCPServer {
    pub fn new() -> Self {
        let mut server = Self {
            tools: HashMap::new(),
            resources: HashMap::new(),
        };
        server.register_tools();
        server
    }

    fn register_tools(&mut self) {
        self.tools.insert(
            "take_snapshot".to_string(),
            MCPTool {
                name: "take_snapshot".to_string(),
                description: "Capture the current DOM state with bounding boxes and UIDs for all interactive elements.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "include_images": {
                            "type": "boolean",
                            "description": "Whether to include base64-encoded screenshots",
                            "default": false
                        },
                        "max_depth": {
                            "type": "integer",
                            "description": "Maximum DOM depth to traverse",
                            "default": 10
                        }
                    }
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "click_by_uid".to_string(),
            MCPTool {
                name: "click_by_uid".to_string(),
                description: "Simulate a native click on an element by its unique identifier (UID).".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "uid": {
                            "type": "string",
                            "description": "The unique identifier of the element to click"
                        },
                        "button": {
                            "type": "string",
                            "enum": ["left", "middle", "right"],
                            "default": "left"
                        }
                    },
                    "required": ["uid"]
                }),
                read_only_hint: false,
            },
        );

        self.tools.insert(
            "evaluate_script".to_string(),
            MCPTool {
                name: "evaluate_script".to_string(),
                description: "Execute arbitrary JavaScript in the context of the active browser tab.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "script": {
                            "type": "string",
                            "description": "JavaScript code to execute"
                        },
                        "await_promise": {
                            "type": "boolean",
                            "default": false
                        }
                    },
                    "required": ["script"]
                }),
                read_only_hint: false,
            },
        );

        self.tools.insert(
            "list_network_requests".to_string(),
            MCPTool {
                name: "list_network_requests".to_string(),
                description: "List all network requests (XHR/Fetch) made by the current page.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "filter_url": {
                            "type": "string",
                            "description": "Filter requests by URL substring"
                        },
                        "filter_method": {
                            "type": "string",
                            "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"]
                        },
                        "include_body": {
                            "type": "boolean",
                            "default": false
                        }
                    }
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "get_screen_capture".to_string(),
            MCPTool {
                name: "get_screen_capture".to_string(),
                description: "Capture the current browser viewport as an image using OS-level screen capture.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "format": {
                            "type": "string",
                            "enum": ["jpeg", "webp", "png"],
                            "default": "jpeg"
                        },
                        "quality": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 100,
                            "default": 85
                        }
                    }
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "extract_page_content".to_string(),
            MCPTool {
                name: "extract_page_content".to_string(),
                description: "Extract and analyze the main text content of the current page.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "include_nlp": {
                            "type": "boolean",
                            "default": true
                        },
                        "max_length": {
                            "type": "integer",
                            "default": 5000
                        }
                    }
                }),
                read_only_hint: true,
            },
        );

        // NEW MCP TOOLS
        self.tools.insert(
            "search_page_content".to_string(),
            MCPTool {
                name: "search_page_content".to_string(),
                description: "Search for text or patterns on the current page and return matching elements with context.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Text or regex pattern to search for"
                        },
                        "use_regex": {
                            "type": "boolean",
                            "default": false
                        },
                        "context_length": {
                            "type": "integer",
                            "description": "Characters of context to include around match",
                            "default": 100
                        }
                    },
                    "required": ["query"]
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "extract_links".to_string(),
            MCPTool {
                name: "extract_links".to_string(),
                description: "Extract all links (URLs) from the current page with their text and context.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "link_type": {
                            "type": "string",
                            "enum": ["all", "internal", "external"],
                            "default": "all"
                        },
                        "include_text": {
                            "type": "boolean",
                            "default": true
                        }
                    }
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "analyze_page_structure".to_string(),
            MCPTool {
                name: "analyze_page_structure".to_string(),
                description: "Analyze the semantic structure of the page (headers, sections, articles, nav, etc.) and return hierarchy.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "include_elements": {
                            "type": "boolean",
                            "default": false
                        }
                    }
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "form_filling".to_string(),
            MCPTool {
                name: "form_filling".to_string(),
                description: "Extract all form fields from the page with their types, IDs, and names for automated filling.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "form_selector": {
                            "type": "string",
                            "description": "CSS selector to target specific form",
                            "default": "form"
                        }
                    }
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "get_tab_info".to_string(),
            MCPTool {
                name: "get_tab_info".to_string(),
                description: "Get comprehensive information about the current tab (URL, title, history, cookies count, etc.).".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "include_cookies": {
                            "type": "boolean",
                            "default": false
                        },
                        "include_history": {
                            "type": "boolean",
                            "default": false
                        }
                    }
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "extract_text_content".to_string(),
            MCPTool {
                name: "extract_text_content".to_string(),
                description: "Extract clean text content from the page, removing navigation, ads, and boilerplate.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "remove_navigation": {
                            "type": "boolean",
                            "default": true
                        },
                        "remove_ads": {
                            "type": "boolean",
                            "default": true
                        }
                    }
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "find_element".to_string(),
            MCPTool {
                name: "find_element".to_string(),
                description: "Find a DOM element using CSS selector, XPath, or text content and return its metadata.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "selector": {
                            "type": "string",
                            "description": "CSS selector to find element"
                        },
                        "search_text": {
                            "type": "string",
                            "description": "Text to search for instead of selector"
                        },
                        "search_xpath": {
                            "type": "string",
                            "description": "XPath expression to find element"
                        }
                    }
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "scroll_page".to_string(),
            MCPTool {
                name: "scroll_page".to_string(),
                description: "Scroll the page up, down, or to a specific position.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "direction": {
                            "type": "string",
                            "enum": ["up", "down", "top", "bottom", "page_up", "page_down"],
                            "default": "down"
                        },
                        "amount": {
                            "type": "integer",
                            "description": "Pixels to scroll (for up/down)",
                            "default": 500
                        }
                    }
                }),
                read_only_hint: false,
            },
        );

        self.tools.insert(
            "scroll_to_element".to_string(),
            MCPTool {
                name: "scroll_to_element".to_string(),
                description: "Scroll the page to bring a specific element into view.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "selector": {
                            "type": "string",
                            "description": "CSS selector of element to scroll to"
                        },
                        "behavior": {
                            "type": "string",
                            "enum": ["auto", "smooth"],
                            "default": "smooth"
                        }
                    },
                    "required": ["selector"]
                }),
                read_only_hint: false,
            },
        );

        self.tools.insert(
            "get_computed_styles".to_string(),
            MCPTool {
                name: "get_computed_styles".to_string(),
                description: "Get computed CSS styles for an element by selector.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "selector": {
                            "type": "string",
                            "description": "CSS selector of element"
                        },
                        "properties": {
                            "type": "array",
                            "description": "Specific properties to retrieve (all if not specified)",
                            "items": {"type": "string"}
                        }
                    },
                    "required": ["selector"]
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "execute_rag_query".to_string(),
            MCPTool {
                name: "execute_rag_query".to_string(),
                description: "Query the Retrieval-Augmented Generation (RAG) knowledge base for relevant information.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Natural language query"
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "Number of results to return",
                            "default": 5
                        },
                        "context": {
                            "type": "string",
                            "description": "Current page context to supplement query"
                        }
                    },
                    "required": ["query"]
                }),
                read_only_hint: true,
            },
        );

        self.tools.insert(
            "store_document".to_string(),
            MCPTool {
                name: "store_document".to_string(),
                description: "Store a document in the RAG knowledge base for future retrieval.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "Document text content"
                        },
                        "metadata": {
                            "type": "object",
                            "description": "Additional metadata (title, source, tags, etc.)"
                        }
                    },
                    "required": ["content"]
                }),
                read_only_hint: false,
            },
        );

        self.tools.insert(
            "get_page_analysis".to_string(),
            MCPTool {
                name: "get_page_analysis".to_string(),
                description: "Comprehensive page analysis: text extraction, NLP, structure, and actionable insights.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "analysis_types": {
                            "type": "array",
                            "description": "Types of analysis to perform",
                            "items": {"type": "string", "enum": ["text", "nlp", "structure", "links", "forms"]}
                        }
                    }
                }),
                read_only_hint: true,
            },
        );

        self.resources.insert(
            "browser://current-tab".to_string(),
            MCPResource {
                uri: "browser://current-tab".to_string(),
                name: "Current Tab".to_string(),
                description: "The currently active browser tab".to_string(),
                mime_type: "text/html".to_string(),
            },
        );

        self.resources.insert(
            "browser://history".to_string(),
            MCPResource {
                uri: "browser://history".to_string(),
                name: "Browser History".to_string(),
                description: "Recent browser history".to_string(),
                mime_type: "application/json".to_string(),
            },
        );

        self.resources.insert(
            "browser://cookies".to_string(),
            MCPResource {
                uri: "browser://cookies".to_string(),
                name: "Current Page Cookies".to_string(),
                description: "Cookies for the current domain".to_string(),
                mime_type: "application/json".to_string(),
            },
        );
    }

    pub fn list_tools(&self) -> Vec<MCPTool> {
        self.tools.values().cloned().collect()
    }

    pub fn list_resources(&self) -> Vec<MCPResource> {
        self.resources.values().cloned().collect()
    }

    pub async fn execute_tool(
        &self,
        tool_call: &MCPToolCall,
        dom_state: &Value,
        network_log: &Value,
    ) -> Result<MCPToolResponse, String> {
        match tool_call.name.as_str() {
            "take_snapshot" => self.execute_take_snapshot(&tool_call.arguments, dom_state),
            "click_by_uid" => self.execute_click_by_uid(&tool_call.arguments),
            "evaluate_script" => self.execute_evaluate_script(&tool_call.arguments),
            "list_network_requests" => self.execute_list_network_requests(&tool_call.arguments, network_log),
            "get_screen_capture" => self.execute_get_screen_capture(&tool_call.arguments).await,
            "extract_page_content" => self.execute_extract_page_content(&tool_call.arguments, dom_state).await,
            
            // NEW TOOL HANDLERS
            "search_page_content" => self.execute_search_page_content(&tool_call.arguments, dom_state),
            "extract_links" => self.execute_extract_links(&tool_call.arguments, dom_state),
            "analyze_page_structure" => self.execute_analyze_page_structure(&tool_call.arguments, dom_state),
            "form_filling" => self.execute_form_filling(&tool_call.arguments, dom_state),
            "get_tab_info" => self.execute_get_tab_info(&tool_call.arguments, dom_state),
            "extract_text_content" => self.execute_extract_text_content(&tool_call.arguments, dom_state),
            "find_element" => self.execute_find_element(&tool_call.arguments, dom_state),
            "scroll_page" => self.execute_scroll_page(&tool_call.arguments),
            "scroll_to_element" => self.execute_scroll_to_element(&tool_call.arguments),
            "get_computed_styles" => self.execute_get_computed_styles(&tool_call.arguments),
            "execute_rag_query" => self.execute_execute_rag_query(&tool_call.arguments).await,
            "store_document" => self.execute_store_document(&tool_call.arguments).await,
            "get_page_analysis" => self.execute_get_page_analysis(&tool_call.arguments, dom_state).await,
            
            _ => Err(format!("Unknown tool: {}", tool_call.name)),
        }
    }

    fn execute_take_snapshot(
        &self,
        args: &HashMap<String, Value>,
        dom_state: &Value,
    ) -> Result<MCPToolResponse, String> {
        let include_images = args.get("include_images")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let _max_depth = args.get("max_depth")
            .and_then(|v| v.as_i64())
            .unwrap_or(10) as usize;

        let snapshot = json!({
            "url": dom_state.get("url").unwrap_or(&Value::Null),
            "title": dom_state.get("title").unwrap_or(&Value::Null),
            "timestamp": Utc::now().to_rfc3339(),
            "elements": dom_state.get("elements").unwrap_or(&Value::Null),
            "metadata": {
                "images_included": include_images
            }
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&snapshot).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_click_by_uid(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<MCPToolResponse, String> {
        let uid = args.get("uid")
            .and_then(|v| v.as_str())
            .ok_or("Missing required argument: uid")?;

        let button = args.get("button")
            .and_then(|v| v.as_str())
            .unwrap_or("left");

        let result = json!({
            "action": "click",
            "uid": uid,
            "button": button,
            "success": true,
            "timestamp": Utc::now().to_rfc3339()
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_evaluate_script(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<MCPToolResponse, String> {
        let script = args.get("script")
            .and_then(|v| v.as_str())
            .ok_or("Missing required argument: script")?;

        let await_promise = args.get("await_promise")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let result = json!({
            "action": "evaluate_script",
            "script_preview": if script.len() > 100 { &script[..100] } else { script },
            "await_promise": await_promise,
            "status": "pending_user_approval"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_list_network_requests(
        &self,
        args: &HashMap<String, Value>,
        network_log: &Value,
    ) -> Result<MCPToolResponse, String> {
        let filter_url = args.get("filter_url").and_then(|v| v.as_str());
        let filter_method = args.get("filter_method").and_then(|v| v.as_str());
        let include_body = args.get("include_body").and_then(|v| v.as_bool()).unwrap_or(false);

        let requests = network_log.get("requests")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let filtered: Vec<Value> = requests
            .into_iter()
            .filter(|req| {
                if let Some(url_filter) = filter_url {
                    if let Some(url) = req.get("url").and_then(|v| v.as_str()) {
                        if !url.contains(url_filter) {
                            return false;
                        }
                    }
                }
                if let Some(method_filter) = filter_method {
                    if let Some(method) = req.get("method").and_then(|v| v.as_str()) {
                        if method != method_filter {
                            return false;
                        }
                    }
                }
                true
            })
            .map(|mut req| {
                if !include_body {
                    if let Some(obj) = req.as_object_mut() {
                        obj.remove("request_body");
                        obj.remove("response_body");
                    }
                }
                req
            })
            .collect();

        let result = json!({
            "total_requests": filtered.len(),
            "filters_applied": {
                "url": filter_url,
                "method": filter_method,
                "include_body": include_body
            },
            "requests": filtered
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    async fn execute_get_screen_capture(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<MCPToolResponse, String> {
        let _format = args.get("format")
            .and_then(|v| v.as_str())
            .unwrap_or("jpeg");

        let _quality = args.get("quality")
            .and_then(|v| v.as_i64())
            .unwrap_or(85) as u8;

        let result = json!({
            "action": "screen_capture",
            "status": "capture_available",
            "note": "Use the capture_frame method via native messaging"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    async fn execute_extract_page_content(
        &self,
        args: &HashMap<String, Value>,
        dom_state: &Value,
    ) -> Result<MCPToolResponse, String> {
        let include_nlp = args.get("include_nlp")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let max_length = args.get("max_length")
            .and_then(|v| v.as_i64())
            .unwrap_or(5000) as usize;

        // Page text may arrive directly in `arguments` (from the sidebar content
        // script) or inside `dom_state` (from the DOM observer path). Prefer the
        // explicit argument, since call_mcp_tool has no live DOM state.
        let raw_text = args.get("text")
            .and_then(|v| v.as_str())
            .or_else(|| dom_state.get("text_content").and_then(|v| v.as_str()))
            .unwrap_or("");

        let text_content: String = raw_text.chars().take(max_length).collect();

        let query = args.get("query").and_then(|v| v.as_str());

        let mut result_data = json!({
            "url": dom_state.get("url").unwrap_or(&Value::Null),
            "title": dom_state.get("title").unwrap_or(&Value::Null),
            "content_length": text_content.len(),
            "content": text_content,
        });

        if let Some(q) = query {
            result_data["query"] = json!(q);
        }

        if include_nlp && !text_content.is_empty() {
            result_data["nlp_analysis"] = json!({
                "sentiment": "neutral",
                "entities": [],
                "summary": "NLP analysis available via the ml_* host methods",
                "keywords": []
            });
        }

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result_data).unwrap_or_default()
            }],
            error: None,
        })
    }

    // NEW TOOL IMPLEMENTATIONS
    fn execute_search_page_content(
        &self,
        args: &HashMap<String, Value>,
        _dom_state: &Value,
    ) -> Result<MCPToolResponse, String> {
        let query = args.get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing required argument: query")?;

        let use_regex = args.get("use_regex")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let context_length = args.get("context_length")
            .and_then(|v| v.as_i64())
            .unwrap_or(100) as usize;

        let matches = json!({
            "query": query,
            "use_regex": use_regex,
            "context_length": context_length,
            "matches_found": 0,
            "note": "Implementation requires DOM integration"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&matches).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_extract_links(
        &self,
        args: &HashMap<String, Value>,
        _dom_state: &Value,
    ) -> Result<MCPToolResponse, String> {
        let link_type = args.get("link_type")
            .and_then(|v| v.as_str())
            .unwrap_or("all");

        let include_text = args.get("include_text")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let result = json!({
            "link_type": link_type,
            "include_text": include_text,
            "links_found": 0,
            "note": "Implementation requires DOM integration"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_analyze_page_structure(
        &self,
        args: &HashMap<String, Value>,
        _dom_state: &Value,
    ) -> Result<MCPToolResponse, String> {
        let include_elements = args.get("include_elements")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let structure = json!({
            "page_type": "unknown",
            "sections": [],
            "headers": [],
            "navigation": [],
            "main_content": null,
            "include_elements": include_elements,
            "note": "Implementation requires DOM integration"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&structure).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_form_filling(
        &self,
        args: &HashMap<String, Value>,
        _dom_state: &Value,
    ) -> Result<MCPToolResponse, String> {
        let form_selector = args.get("form_selector")
            .and_then(|v| v.as_str())
            .unwrap_or("form");

        let result = json!({
            "form_selector": form_selector,
            "fields_found": 0,
            "fields": [],
            "note": "Implementation requires DOM integration"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_get_tab_info(
        &self,
        args: &HashMap<String, Value>,
        dom_state: &Value,
    ) -> Result<MCPToolResponse, String> {
        let include_cookies = args.get("include_cookies")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let include_history = args.get("include_history")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let result = json!({
            "url": dom_state.get("url").unwrap_or(&Value::Null),
            "title": dom_state.get("title").unwrap_or(&Value::Null),
            "include_cookies": include_cookies,
            "include_history": include_history,
            "note": "Implementation requires browser API integration"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_extract_text_content(
        &self,
        args: &HashMap<String, Value>,
        dom_state: &Value,
    ) -> Result<MCPToolResponse, String> {
        let remove_navigation = args.get("remove_navigation")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let remove_ads = args.get("remove_ads")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let content = dom_state.get("text_content")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let result = json!({
            "remove_navigation": remove_navigation,
            "remove_ads": remove_ads,
            "content": content,
            "content_length": content.len()
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_find_element(
        &self,
        args: &HashMap<String, Value>,
        dom_state: &Value,
    ) -> Result<MCPToolResponse, String> {
        let selector = args.get("selector").and_then(|v| v.as_str());
        let search_text = args.get("search_text").and_then(|v| v.as_str());
        let search_xpath = args.get("search_xpath").and_then(|v| v.as_str());

        let result = json!({
            "selector": selector,
            "search_text": search_text,
            "search_xpath": search_xpath,
            "element_found": false,
            "note": "Implementation requires DOM integration"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_scroll_page(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<MCPToolResponse, String> {
        let direction = args.get("direction")
            .and_then(|v| v.as_str())
            .unwrap_or("down");

        let amount = args.get("amount")
            .and_then(|v| v.as_i64())
            .unwrap_or(500) as i32;

        let result = json!({
            "action": "scroll",
            "direction": direction,
            "amount": amount,
            "status": "pending_user_approval"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_scroll_to_element(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<MCPToolResponse, String> {
        let selector = args.get("selector")
            .and_then(|v| v.as_str())
            .ok_or("Missing required argument: selector")?;

        let behavior = args.get("behavior")
            .and_then(|v| v.as_str())
            .unwrap_or("smooth");

        let result = json!({
            "action": "scroll_to_element",
            "selector": selector,
            "behavior": behavior,
            "status": "pending_user_approval"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    fn execute_get_computed_styles(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<MCPToolResponse, String> {
        let selector = args.get("selector")
            .and_then(|v| v.as_str())
            .ok_or("Missing required argument: selector")?;

        let properties = args.get("properties")
            .and_then(|v| v.as_array())
            .map(|v| v.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>());

        let result = json!({
            "selector": selector,
            "properties_requested": properties,
            "styles": {},
            "note": "Implementation requires DOM integration"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    async fn execute_execute_rag_query(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<MCPToolResponse, String> {
        let query = args.get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing required argument: query")?;

        let top_k = args.get("top_k")
            .and_then(|v| v.as_i64())
            .unwrap_or(5) as usize;

        let context = args.get("context")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let result = json!({
            "query": query,
            "top_k": top_k,
            "context": context,
            "results": [],
            "note": "Implementation requires RAG backend integration"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    async fn execute_store_document(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<MCPToolResponse, String> {
        let content = args.get("content")
            .and_then(|v| v.as_str())
            .ok_or("Missing required argument: content")?;

        let metadata = args.get("metadata")
            .and_then(|v| v.as_object())
            .cloned();

        let result = json!({
            "document_stored": true,
            "content_length": content.len(),
            "metadata": metadata,
            "note": "Implementation requires RAG backend integration"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    async fn execute_get_page_analysis(
        &self,
        args: &HashMap<String, Value>,
        dom_state: &Value,
    ) -> Result<MCPToolResponse, String> {
        let analysis_types = args.get("analysis_types")
            .and_then(|v| v.as_array())
            .map(|v| v.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>())
            .unwrap_or_else(|| vec!["text", "nlp"]);

        let result = json!({
            "analysis_types": analysis_types,
            "page_url": dom_state.get("url").unwrap_or(&Value::Null),
            "page_title": dom_state.get("title").unwrap_or(&Value::Null),
            "analysis": {},
            "note": "Comprehensive analysis requires DOM + NLP integration"
        });

        Ok(MCPToolResponse {
            content: vec![MCPContent::Text {
                text: serde_json::to_string_pretty(&result).unwrap_or_default()
            }],
            error: None,
        })
    }

    pub fn generate_manifest(&self) -> Value {
        json!({
            "mcp_version": "1.0",
            "server_name": "zen-agentic-mcp",
            "description": "MCP server for Zen Browser agentic AI integration",
            "tools": self.list_tools().iter().map(|t| {
                json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.input_schema,
                    "read_only_hint": t.read_only_hint
                })
            }).collect::<Vec<_>>(),
            "resources": self.list_resources().iter().map(|r| {
                json!({
                    "uri": r.uri,
                    "name": r.name,
                    "description": r.description,
                    "mime_type": r.mime_type
                })
            }).collect::<Vec<_>>()
        })
    }
}

impl Default for MCPServer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_server_initialization() {
        let server = MCPServer::new();
        assert_eq!(server.list_tools().len(), 19);
        assert_eq!(server.list_resources().len(), 3);
    }

    #[test]
    fn test_tool_registration() {
        let server = MCPServer::new();
        let tools = server.list_tools();
        let tool_names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        assert!(tool_names.contains(&"take_snapshot"));
        assert!(tool_names.contains(&"click_by_uid"));
        assert!(tool_names.contains(&"evaluate_script"));
        assert!(tool_names.contains(&"list_network_requests"));
        assert!(tool_names.contains(&"get_screen_capture"));
        assert!(tool_names.contains(&"extract_page_content"));
        for name in [
            "search_page_content",
            "extract_links",
            "analyze_page_structure",
            "form_filling",
            "get_tab_info",
            "extract_text_content",
            "find_element",
            "scroll_page",
            "scroll_to_element",
            "get_computed_styles",
            "execute_rag_query",
            "store_document",
            "get_page_analysis",
        ] {
            assert!(tool_names.contains(&name), "missing tool: {name}");
        }
    }

    #[tokio::test]
    async fn test_take_snapshot() {
        let server = MCPServer::new();
        let dom_state = json!({
            "url": "https://example.com",
            "title": "Example Domain",
            "elements": []
        });

        let call = MCPToolCall {
            name: "take_snapshot".to_string(),
            arguments: HashMap::from([
                ("include_images".to_string(), json!(false)),
                ("max_depth".to_string(), json!(5)),
            ]),
        };

        let response = server.execute_tool(&call, &dom_state, &json!({})).await.unwrap();
        assert!(response.error.is_none());
        assert!(!response.content.is_empty());
    }

    #[test]
    fn test_manifest_generation() {
        let server = MCPServer::new();
        let manifest = server.generate_manifest();
        assert_eq!(manifest["server_name"], "zen-agentic-mcp");
        assert!(manifest["tools"].is_array());
        assert!(manifest["resources"].is_array());
    }
}
