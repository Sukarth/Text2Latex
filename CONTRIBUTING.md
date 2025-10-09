# Contributing to Text2Latex

First off, thank you for considering contributing to Text2Latex! Every contribution is valuable and helps make Text2Latex better.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Guidelines](#coding-guidelines)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## 📜 Code of Conduct

This project and everyone participating in it is governed by respect and professionalism. By participating, you are expected to uphold this standard. Please be respectful, constructive, and collaborative.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Not required for basic development, but helpful for future tooling
- **Browser**: Chrome, Edge, or any Chromium-based browser
- **Git**: For version control
- **Code Editor**: VS Code recommended

### Development Setup

1. **Fork the Repository**
   ```bash
   # Click the 'Fork' button on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/text2latex.git
   cd text2latex
   ```

2. **Add Upstream Remote**
   ```bash
   git remote add upstream https://github.com/sukarth/text2latex.git
   ```

3. **Load Extension in Browser**
   - Open Chrome/Edge
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project directory

4. **Configure API Keys**
   - Click the extension icon
   - Open settings
    - Add your AI provider API key for testing
    - Set an encryption passphrase (required before storing keys)

5. **Start Developing!**
   - Make changes to the code
   - Click the refresh icon in `chrome://extensions/` to reload
   - Test your changes

## 📁 Project Structure

```
text2latex/
├── manifest.json          # Extension manifest (V3)
├── background.js          # Service worker (background tasks)
├── content.js            # Content script (injected into pages)
├── popup.html            # Popup UI
├── popup.js              # Popup logic
├── options.html          # Settings page UI
├── options.js            # Settings page logic
├── secure-storage.js     # Shared encryption helpers
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── LICENSE               # MIT License
├── README.md             # Project documentation
├── CHANGELOG.md          # Version history
├── CONTRIBUTING.md       # This file
└── .gitignore           # Git ignore rules
```

### Key Components

#### `manifest.json`
- Extension configuration
- Permissions and host permissions
- Keyboard shortcuts
- Icons and metadata

#### `background.js`
- Service worker running in background
- Handles API calls to AI providers
- Manages settings storage
- Processes conversion requests
- Implements provider abstraction

#### `content.js`
- Injected into all web pages
- Listens for user input
- Creates and manages overlay UI
- Handles keyboard shortcuts
- Manages text selection and replacement
- Renders LaTeX preview with MathJax

#### `popup.js` & `popup.html`
- Browser action popup
- Quick enable/disable toggle
- Current settings display
- Link to full settings

#### `options.js` & `options.html`
- Comprehensive settings interface
- Provider configuration
- API key management
- Model selection
- Parameter tuning

## 🔄 Development Workflow

### Creating a Feature Branch

```bash
# Update your main branch
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/your-feature-name
```

### Making Changes

1. **Write Clean Code**: Follow the coding guidelines below
2. **Test Thoroughly**: Test across different websites and input types
3. **Document**: Add comments for complex logic
4. **Commit Often**: Make small, logical commits

```bash
# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "feat: add support for new provider"
```

### Keeping Your Fork Updated

```bash
# Fetch upstream changes
git fetch upstream

# Merge upstream main into your branch
git checkout main
git merge upstream/main

# Rebase your feature branch
git checkout feature/your-feature-name
git rebase main
```

## 💻 Coding Guidelines

### JavaScript Style

- **Use ES6+ features**: const/let, arrow functions, async/await
- **Prefer async/await** over promise chains
- **Use meaningful variable names**: `isEnabled` not `ie`
- **Add comments** for complex logic
- **Keep functions small**: Single responsibility principle
- **Handle errors gracefully**: Try-catch blocks with user feedback

### Code Formatting

```javascript
// Good
async function convertText(text, provider, config) {
    try {
        const result = await callAPI(text, provider, config);
        return result;
    } catch (error) {
        console.error('Conversion failed:', error);
        throw error;
    }
}

// Bad
function convertText(t,p,c){return callAPI(t,p,c).catch(e=>console.log(e))}
```

### Best Practices

1. **Error Handling**: Always handle promise rejections
2. **User Feedback**: Show loading states and error messages
3. **Performance**: Debounce expensive operations
4. **Security**: Never log API keys or sensitive data
5. **Accessibility**: Use semantic HTML and ARIA labels
6. **Browser Compatibility**: Test on Chrome and Edge

### API Provider Integration

When adding a new provider:

1. Add provider config to `DEFAULT_SETTINGS` in `background.js`
2. Implement provider function following this pattern:

```javascript
async function convertWithNewProvider(text, config, settings, systemPrompt, signal) {
    const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        signal,
        body: JSON.stringify({
            // Provider-specific request format
        })
    });

    if (!response.ok) {
        throw new Error(`Provider error: ${response.status}`);
    }

    const data = await response.json();
    return extractTextFromResponse(data);
}
```

3. Add case to `convertWithAI` switch statement
4. Update UI in `options.html` and `options.js`
5. Document in README.md

## 🧪 Testing

### Manual Testing Checklist

Before submitting a PR, test the following:

- [ ] Extension loads without errors
- [ ] Settings page opens and saves correctly
- [ ] API key configuration works
- [ ] Manual conversion (Ctrl+Shift+L) works
- [ ] Auto-conversion mode works
- [ ] Preview rendering displays correctly
- [ ] Accept/reject suggestions work
- [ ] Keyboard shortcuts function properly
- [ ] Works on different input types:
  - [ ] Regular text inputs
  - [ ] Textareas
  - [ ] Content-editable divs
- [ ] Works on different websites (Gmail, Google Docs, etc.)
- [ ] Error handling displays user-friendly messages
- [ ] No console errors in normal operation
- [ ] Encryption unlock prompts appear when expected (locked state)
- [ ] API keys remain encrypted after reload/unload
- [ ] Popup status reflects locked/unlocked states accurately

### Testing Different Providers

Test with at least one provider (preferably the one you have API access to):

- [ ] Provider authentication works
- [ ] Model selection populates correctly
- [ ] Conversion produces valid LaTeX
- [ ] Error handling for API failures
- [ ] Request cancellation works

### Browser Testing

- [ ] Chrome (latest)
- [ ] Edge (latest)
- [ ] Chrome (one version back)

## 📤 Submitting Changes

### Pull Request Process

1. **Update Documentation**: If you've added features, update README.md
2. **Update Changelog**: Add entry to CHANGELOG.md under "Unreleased"
3. **Push to Your Fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
4. **Create Pull Request**:
   - Go to your fork on GitHub
   - Click "New Pull Request"
   - Select your feature branch
   - Fill out the PR template

### PR Title Format

Use conventional commits format:

- `feat: add support for XYZ models`
- `fix: resolve overlay positioning issue`
- `docs: update installation instructions`
- `refactor: simplify API error handling`
- `style: improve settings page layout`
- `test: add manual testing checklist`
- `chore: update dependencies`

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested manually
- [ ] Tested on multiple browsers
- [ ] Tested with multiple providers

## Screenshots (if applicable)
Add screenshots of UI changes

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-reviewed my code
- [ ] Commented complex sections
- [ ] Updated documentation
- [ ] No new warnings or errors
```

## 🐛 Reporting Bugs

### Before Submitting a Bug Report

- Check the [issue tracker](https://github.com/sukarth/text2latex/issues)
- Check if the issue is fixed in the latest version
- Collect information about your setup

### Bug Report Template

**Title**: Clear, descriptive title

**Description**:
- What happened
- What you expected to happen
- Steps to reproduce
- Browser and version
- Extension version
- Provider and model (if relevant)
- Console errors (if any)

**Example**:

```markdown
**Bug**: LaTeX preview not rendering for fractions

**Steps to Reproduce**:
1. Open extension on any website
2. Type "x over y" in a text field
3. Press Ctrl+Shift+L
4. Observe overlay

**Expected**: Should show rendered fraction
**Actual**: Shows raw LaTeX code
**Browser**: Chrome 120.0.6099.109
**Extension**: v1.0.0
**Console**: MathJax is not defined
```

## 💡 Suggesting Features

We love feature requests! Please provide:

1. **Use Case**: Why is this feature needed?
2. **Proposed Solution**: How should it work?
3. **Alternatives**: Other ways to achieve this
4. **Additional Context**: Screenshots, examples, etc.

**Example**:

```markdown
**Feature**: Support for equation numbering

**Use Case**: When writing academic papers, equations need reference numbers

**Proposed Solution**: 
- Add checkbox in settings for "Auto-number equations"
- Wrap display math in equation environments
- Add \label{eq:N} automatically

**Alternatives**:
- Manual toggle per conversion
- Post-processing step

**Example**:
Input: "E equals mc squared"
Output: \begin{equation}\label{eq:1} E = mc^2 \end{equation}
```

## 📚 Additional Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [LaTeX Documentation](https://www.latex-project.org/help/documentation/)
- [MathJax Documentation](https://docs.mathjax.org/)

## 🤝 Community

- **Questions**: Open a [GitHub Discussion](https://github.com/sukarth/text2latex/discussions)
- **Bugs**: Open a [GitHub Issue](https://github.com/sukarth/text2latex/issues)
- **Features**: Open a [GitHub Issue](https://github.com/sukarth/text2latex/issues)

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Text2Latex! 🎉**

*Made with ❤️ by Sukarth Acharya and contributors*
