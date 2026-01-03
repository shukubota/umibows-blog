# Claude Code Configuration

## Project Overview
Umibows Blog - A Next.js blog with interactive mathematical visualizations and educational content.

## Commands

### Development
```bash
npm run dev    # Start development server
npm run build  # Build for production
npm run start  # Start production server
npm run lint   # Run ESLint
```

### Testing
```bash
# No test framework configured yet
```

## Environment Setup

Required environment variables:
- `ANTHROPIC_API_KEY`: For handwriting recognition in TeX Previewer

## Project Structure

- `/app/` - Next.js 14 app router pages
  - `/tex/` - LaTeX mathematical expression previewer with handwriting recognition
  - `/igo/` - Go/Igo game interface
  - `/lorenz/` - Lorenz attractor visualization
  - `/weather-map/` - Weather map integration
  - `/othello/` - Othello game variants
  - `/double-pendulum/` - Physics simulation
  - `/numerical-comparison/` - Mathematical comparisons
  - `/storymaker/` - Story generation tool
- `/components/` - Shared React components
- `/hooks/` - Custom React hooks
- `/public/` - Static assets

## Key Technologies

- **Next.js 14**: React framework with app router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **KaTeX**: Mathematical expression rendering
- **Anthropic Claude API**: AI-powered features
- **Material-UI**: Component library for some features

## Code Style Guidelines

- Use TypeScript for all new code
- Follow Next.js app router conventions
- Use Tailwind CSS for styling
- Implement responsive design patterns
- Prefer functional components with hooks

## Development Notes

- The TeX Previewer supports both manual input and handwriting recognition via Claude API
- Interactive visualizations use HTML5 Canvas and React refs
- All pages follow a dark theme design pattern
- Mathematical content uses KaTeX for rendering

## Agent Skills

This repository benefits from specialized Claude Code agents for:
- Mathematical expression handling and LaTeX formatting
- Interactive visualization development
- Next.js/React component architecture
- Educational content creation and optimization