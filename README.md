# Text2Latex

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue.svg)](https://github.com/sukarth/text2latex)

Text2Latex is a powerful browser extension that seamlessly converts your typed mathematical expressions and equations into proper LaTeX format using AI. Perfect for students, researchers, and anyone who works with mathematical notation regularly.

</div>

## ✨ Features

- **🤖 AI-Powered Conversion**: Leverages advanced AI models to intelligently recognize and convert mathematical expressions
- **⚡ Real-time Processing**: Optional auto-conversion as you type: with customizable delay
- **🎯 Smart Selection**: Convert only **selected text** or **entire** input fields
- **👁️ Live Preview**: See rendered LaTeX output before accepting changes
- **⌨️ Keyboard Shortcuts**: Quick conversion with customizable hotkeys
- **🔧 Multi-Provider Support**: 
  - OpenAI GPT
  - Anthropic Claude
  - Google Gemini
  - OpenRouter (access to multiple models, including several free ones)
- **🎨 Beautiful Overlay UI**: Non-intrusive overlay with rendered preview
- **⚙️ Highly Configurable**: Customize conversion settings, delays, and provider preferences
- **🔒 Secure Storage**: Client-side AES-256 encryption for API keys with passphrase protection

## 🚀 Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/sukarth/text2latex.git
   cd text2latex
   ```

2. Open Chrome/Edge and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the cloned directory

### From Chrome Web Store

*Coming soon!!!*

## 🔧 Configuration

1. Click the Text2Latex icon in your browser toolbar
2. Click "Open Settings" to configure:
   - **Provider Selection**: Choose your preferred AI provider
  - **API Keys**: Enter your API key for the selected provider (encrypted locally)
  - **Encryption**: Set a passphrase to lock/unlock encrypted credentials
   - **Model Selection**: Choose from available models
   - **Conversion Settings**:
     - Auto-convert: Enable/disable automatic conversion
     - Delay: Set typing delay before conversion (600-2000 ms)
     - Temperature: Control AI creativity (0.0-1.0)
     - Max Tokens: Set maximum response length
   - **Preview Settings**: Toggle LaTeX preview rendering

### Getting API Keys

- **OpenAI**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Anthropic**: [console.anthropic.com](https://console.anthropic.com)
- **Google**: [aistudio.google.com/app/api-keys](https://aistudio.google.com/app/api-keys)
- **OpenRouter**: [openrouter.ai/keys](https://openrouter.ai/keys)

## 📖 Usage

### Manual Conversion

1. Type or select mathematical text in any input field
2. Press `Ctrl+Shift+L` (or `Cmd+Shift+L` on Mac)
3. Review the LaTeX output in the overlay
4. Press `Tab` or click "Accept" to replace the text
5. Press `Escape` to cancel

> 🔐 **Note:** If the extension reports that encryption is locked, unlock your API keys from the popup or settings page using your passphrase.

### Auto-Conversion Mode

1. Enable "Auto Convert" in settings
2. Type mathematical expressions naturally
3. The extension will automatically attempt to convert after the configured delay
4. Review and accept or dismiss the suggestion

### Example Conversions

- **Input**: `x squared plus y squared equals r squared`
  - **Output**: `$x^2 + y^2 = r^2$`

- **Input**: `integral from 0 to infinity of e to the negative x dx`
  - **Output**: `$\int_0^\infty e^{-x} \, dx$`

- **Input**: `sum from i equals 1 to n of x sub i`
  - **Output**: `$\sum_{i=1}^n x_i$`

- **Input**: `the limit as x approaches 0 of sin x over x equals 1`
  - **Output**: `$\lim_{x \to 0} \frac{\sin x}{x} = 1$`

## ⌨️ Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Convert to LaTeX | `Ctrl+Shift+L` | `Cmd+Shift+L` |
| Accept Suggestion | `Ctrl+Shift+A` or `Tab` | `Cmd+Shift+A` or `Tab` |
| Hide Overlay | `Ctrl+Shift+H` or `Esc` | `Cmd+Shift+H` or `Esc` |

**Note: These are the default shortcuts, and can be customized in `chrome://extensions/shortcuts`**

## 🎯 Supported Input Fields

Text2Latex works with:
- Standard text inputs (`<input type="text">`)
- Textareas (`<textarea>`)
- Content-editable elements
- Most web-based editors and forms

## 🛠️ Technical Details

- **Manifest Version**: 3
- **Browser Compatibility**: Chrome, Edge, and other Chromium-based browsers
- **Permissions**: Storage, Active Tab, Scripting
- **AI Integration**: REST API calls to configured providers
- **LaTeX Rendering**: MathJax-powered preview

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on:
- Setting up the development environment
- Code structure and architecture
- Submitting pull requests
- Reporting bugs and requesting features

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes and releases.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- MathJax for LaTeX rendering
- AI providers for making this conversion possible
- The open-source community for inspiration and support

## 📧 Help

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/sukarth/text2latex/issues)
- 💡 **Feature Requests**: [GitHub Issues](https://github.com/sukarth/text2latex/issues)

## ⚠️ Privacy & Security

- API keys are encrypted locally using AES-256-GCM with a passphrase you control
- Encrypted keys never leave your device and automatically relock when the extension unloads
- Text conversion requests are sent only to your configured AI provider
- No usage data is collected or tracked by this extension
- All processing is done client-side except for AI API calls (handled by the AI model provider)

## 💖 Support

If this project helps or saves you time, consider supporting my work, as it keeps projects like this free, open source, and maintained:

[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-%E2%9D%A4-EA4AAA?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/Sukarth)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?logo=kofi&logoColor=white)](https://ko-fi.com/sukarth)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕-FFDD00?logoColor=black)](https://buymeacoffee.com/sukarth)

Can't donate? Starring the repo ⭐, reporting bugs, and sharing the project help just as much!

---

**Made with ❤️ by [Sukarth](https://github.com/sukarth)**
