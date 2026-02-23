# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Umibows Blog - A Next.js blog featuring interactive mathematical visualizations, educational content, and AI-powered tools for engineers and learners.

## Commands

### Development

```bash
npm run dev        # Start development server (HTTP)
npm run dev:https  # Start development server with HTTPS (required for camera access)
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint
npm run format     # Format code with Prettier
```

### Testing

```bash
# No test framework configured yet
```

## Environment Setup

Required environment variables:

- `ANTHROPIC_API_KEY`: Required for handwriting recognition in TeX Previewer and story generation

## Architecture Patterns

### AI Integration
- **Server Actions**: AI API calls are implemented as Next.js server actions (see `app/tex/actions.ts`)
- **Multiple AI Providers**: Uses both Anthropic Claude and Google Generative AI for different features
- **Image-to-LaTeX**: Handwriting recognition converts images to LaTeX expressions using Claude's vision capabilities

### Interactive Visualizations
- **Canvas-based**: Mathematical simulations use HTML5 Canvas with React refs
- **Real-time Controls**: Interactive parameters update visualizations using React state
- **Animation Loop**: Uses `requestAnimationFrame` for smooth 60fps animations
- **Physics Simulations**: Implements numerical methods (RK4) for differential equations

### Code Organization
- **Page Components**: Each app route contains self-contained interactive applications
- **Shared Components**: Reusable UI components in `/components/`
- **Custom Hooks**: Application-specific logic in `/hooks/`
- **Server Actions**: AI and API integrations in page-level `actions.ts` files

## Project Structure

- `/app/` - Next.js 14 app router pages (interactive applications)
  - `/tex/` - LaTeX expression previewer with handwriting recognition
  - `/igo/` - Go/Igo game with AI opponent
  - `/lorenz/` - Lorenz attractor chaos theory visualization
  - `/double-pendulum/` - Physics simulation with chaos demonstration
  - `/numerical-comparison/` - Euler vs RK4 integration methods comparison
  - `/english-for-engineers/` - Interactive English learning scenarios
  - `/storymaker/` - AI-powered story generation tool
  - `/profile/` - Engineer profile and portfolio page
  - `/image-generator/` - AI image generation interface
- `/components/` - Shared React components for visualizations
- `/hooks/` - Custom React hooks for game logic and state management

## Key Technologies

- **Next.js 14**: App router with server actions
- **TypeScript**: Full type safety across the project
- **Tailwind CSS**: Utility-first styling with custom configurations
- **KaTeX**: Mathematical expression rendering
- **Anthropic Claude API**: Vision and text generation capabilities
- **Google Generative AI**: Alternative AI provider for specific features
- **Material-UI**: Select components for enhanced UI elements
- **Canvas API**: Real-time mathematical visualizations

## Code Style

### Formatting
- **Prettier**: Configured with 2-space indentation, 100-character line width
- **ESLint**: Integrated with Prettier for code quality
- **Double Quotes**: Preferred for string literals
- **Trailing Commas**: ES5 standard

### Development Patterns
- Use TypeScript interfaces for complex data structures
- Implement responsive design with Tailwind CSS breakpoints
- Use functional components with hooks exclusively
- Prefer server actions for AI API interactions
- Use useRef for Canvas and animation state management

## Development Workflow Guidelines

### Git Operations
- **Never automatically commit or push** changes after file modifications
- **Only execute git operations** when explicitly requested by user with commands like:
  - "commit" - Create commit only
  - "commit push" - Create commit and push to remote
  - "quality commit" - Run quality checks then commit
- **Always ask for confirmation** before executing destructive git operations
- **Use clear commit messages** following conventional format with Co-Authored-By tag
- **Report status only** after completing file changes, do not auto-commit

### Code Modifications
- **Complete requested changes first**, then wait for git instructions
- **Stage related files together** when creating commits
- **Include meaningful commit messages** that explain the why, not just the what

## Development Notes

- **HTTPS Required**: Camera access in TeX Previewer requires `npm run dev:https`
- **Canvas Performance**: Visualizations clear/redraw on each frame for optimal performance
- **AI Rate Limits**: Server actions include error handling for API rate limiting
- **Mathematical Accuracy**: Physics simulations use proven numerical methods (RK4, Euler)
- **Dark Theme**: All applications follow consistent dark theme patterns
