# Changelog

All notable changes to Text2Latex will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-09

### 🎉 Initial Release

#### Added
- **Core Functionality**
  - Natural language to LaTeX conversion using AI
  - Support for multiple AI providers (OpenAI, Anthropic, Google, OpenRouter)
  - Real-time LaTeX preview with MathJax rendering
  - Smart text selection and replacement

- **User Interface**
  - Beautiful overlay UI for conversion preview
  - Popup interface for quick enable/disable
  - Comprehensive settings page with provider configuration
  - Visual feedback during conversion process
  - Animated loading states

- **Conversion Features**
  - Manual conversion via keyboard shortcuts
  - Optional auto-conversion mode with configurable delay
  - Support for both inline and display math
  - Intelligent recognition of mathematical expressions
  - Preservation of non-mathematical text

- **Keyboard Shortcuts**
  - `Ctrl+Shift+L` / `Cmd+Shift+L`: Trigger conversion
  - `Ctrl+Shift+A` / `Cmd+Shift+A`: Accept suggestion
  - `Ctrl+Shift+H` / `Cmd+Shift+H`: Hide overlay
  - `Tab`: Accept suggestion (when overlay visible)
  - `Escape`: Cancel conversion and hide overlay

- **Configuration Options**
  - Provider selection (OpenAI, Anthropic, Google, OpenRouter)
  - Model selection with automatic model discovery
  - API key management
  - Temperature control (0.0 - 1.0)
  - Max tokens configuration
  - Conversion delay adjustment (600-3000ms)
  - Auto-convert toggle
  - Preview rendering toggle
  - Notification preferences

- **Input Support**
  - Standard text inputs
  - Textareas
  - Content-editable elements
  - Selection-based conversion
  - Full-text conversion

- **Developer Features**
  - Comprehensive error handling
  - Request cancellation support
  - Settings persistence via Chrome storage sync
  - Provider abstraction for easy extensibility
  - Detailed inline documentation

#### Technical Details
- Manifest V3 compliance
- Service worker-based background processing
- Content script injection for all URLs
- Secure API key storage
- AbortController for request cancellation
- Debounced auto-conversion
- MathJax CDN integration for rendering

#### Security
- Local-only API key storage
- No data collection or tracking
- Secure HTTPS API endpoints
- Content Security Policy compliance
- AES-256-GCM encryption for API keys with user-managed passphrase
- Secure storage migration using Chrome local storage with encrypted payloads
- Options page security section for enabling, unlocking, and rotating passphrases
- Popup quick action to view encryption status and lock/unlock keys

**Note**: This is the first public release. Please report any bugs or feature requests on [GitHub Issues](https://github.com/sukarth/text2latex/issues).


## Future Releases

### Planned Features
- [ ] Support for more AI providers
- [ ] Custom system prompt configuration
- [ ] Conversion history
- [ ] Favorite/saved conversions
- [ ] Firefox extension support
- [ ] Safari extension support
- [ ] Offline mode with local models
- [ ] LaTeX syntax highlighting
- [ ] Export functionality
- [ ] Theme customization
- [ ] Multi-language support

### Under Consideration
- Context menu integration
- Side panel interface
- Collaborative features
- Cloud sync across devices
- Advanced LaTeX editor integration
- Math symbol picker
- Template library
- Equation editor UI
