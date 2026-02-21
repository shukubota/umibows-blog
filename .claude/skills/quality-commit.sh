#!/bin/bash
set -e

# Quality Commit Script
# Runs Prettier, ESLint, and security checks before committing

echo "🔍 Starting quality commit process..."

# Get script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to handle errors and rollback
handle_error() {
    echo "❌ Error occurred: $1"
    echo "💡 Please fix the issues and try again"
    exit 1
}

# Step 1: Check if there are changes to commit
if [[ -z $(git status --porcelain) ]]; then
    echo "ℹ️  No changes to commit"
    exit 0
fi

echo "📝 Changes detected, proceeding with quality checks..."

# Step 2: Run security scan first (before any modifications)
echo "🔒 Running security scan..."
if ! "$SCRIPT_DIR/security-scan.sh"; then
    handle_error "Security scan failed - sensitive information detected"
fi
echo "✅ Security scan passed"

# Step 3: Run Prettier formatting
echo "🎨 Running Prettier formatting..."
if ! npm run format; then
    handle_error "Prettier formatting failed"
fi
echo "✅ Prettier formatting completed"

# Step 4: Run ESLint checks
echo "🔍 Running ESLint checks..."
if ! npm run lint; then
    echo "⚠️  ESLint found issues. Attempting to auto-fix..."
    if ! npm run lint -- --fix; then
        handle_error "ESLint errors found that require manual fixing"
    fi
fi
echo "✅ ESLint checks passed"

# Step 5: Run security scan again after formatting (to catch any new issues)
echo "🔒 Running final security scan..."
if ! "$SCRIPT_DIR/security-scan.sh"; then
    handle_error "Final security scan failed - formatting may have exposed sensitive information"
fi
echo "✅ Final security scan passed"

# Step 6: Stage all changes
echo "📦 Staging all changes..."
git add .

# Step 7: Check if there are staged changes after formatting
if [[ -z $(git diff --cached) ]]; then
    echo "ℹ️  No changes to commit after formatting"
    exit 0
fi

# Step 8: Create commit with message
COMMIT_MSG="${1:-"Apply code formatting, quality fixes, and security checks

- Run Prettier for consistent formatting
- Fix ESLint issues
- Pass security scan for sensitive data
- Ensure code quality and security standards

Co-Authored-By: Claude Sonnet 4 <noreply@anthropic.com>"}"

echo "💾 Creating commit..."
if ! git commit -m "$COMMIT_MSG"; then
    handle_error "Git commit failed"
fi

echo "🎉 Quality commit completed successfully!"
echo "📊 Commit summary:"
git log --oneline -1
echo ""
echo "🔒 Security: ✅ Passed"
echo "🎨 Formatting: ✅ Applied"
echo "🔍 Linting: ✅ Passed"