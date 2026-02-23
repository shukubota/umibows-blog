#!/bin/bash

# Security Scanner Script
# Scans for API keys, tokens, and other sensitive information

set -e

echo "🔒 Starting security scan..."

# Define sensitive patterns to check for
PATTERN_NAMES=(
    "API Keys"
    "Generic Secrets"
    "Private Keys"
    "JWT Tokens"
    "Database URLs"
    "AWS Keys"
    "GitHub Tokens"
)

PATTERNS=(
    "(ANTHROPIC_API_KEY|OPENAI_API_KEY|CLAUDE_API_KEY|AWS_ACCESS_KEY|GOOGLE_API_KEY|GITHUB_TOKEN).*=.*['\"]?[A-Za-z0-9_-]{20,}['\"]?"
    "(SECRET|PASSWORD|PASS|TOKEN|KEY).*=.*['\"]?[A-Za-z0-9!@#\$%^&*()_+-=]{8,}['\"]?"
    "-----BEGIN (RSA |EC |DSA |PGP )?PRIVATE KEY-----"
    "eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*"
    "(mongodb|postgres|mysql|redis)://[^\s\"']*"
    "AKIA[0-9A-Z]{16}"
    "gh[pousr]_[A-Za-z0-9]{36}"
)

# Files to exclude from scanning
EXCLUDE_PATTERNS=(
    "node_modules"
    ".git"
    ".next"
    "*.log"
    "package-lock.json"
    "yarn.lock"
    "*.min.js"
    ".claude/skills"  # Exclude this script itself
    "*.svg"           # Exclude SVG files (contain path coordinates, not IPs)
    "public"          # Exclude public assets
)

# Build exclude arguments for grep
EXCLUDE_ARGS=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude-dir=$pattern"
done

VIOLATIONS_FOUND=0
TEMP_FILE=$(mktemp)

# Function to scan for pattern
scan_pattern() {
    local pattern_name="$1"
    local pattern="$2"

    echo "  🔍 Scanning for $pattern_name..."

    # Scan all files recursively, excluding placeholder values
    if grep -r -n -E "$pattern" . $EXCLUDE_ARGS 2>/dev/null | grep -v "\.claude/skills/" | grep -v "\.envrc" | grep -v "your_.*_here" | grep -v "example" | grep -v "template" | grep -v "dummy" | grep -v "placeholder" >> "$TEMP_FILE"; then
        echo "    ⚠️  Found potential $pattern_name violations:"
        grep -r -n -E "$pattern" . $EXCLUDE_ARGS 2>/dev/null | grep -v "\.claude/skills/" | grep -v "\.envrc" | grep -v "your_.*_here" | grep -v "example" | grep -v "template" | grep -v "dummy" | grep -v "placeholder" | while read -r line; do
            echo "    📍 $line"
        done
        return 1
    else
        echo "    ✅ No $pattern_name violations found"
        return 0
    fi
}

# Scan for each pattern
for i in "${!PATTERN_NAMES[@]}"; do
    pattern_name="${PATTERN_NAMES[$i]}"
    pattern="${PATTERNS[$i]}"
    if ! scan_pattern "$pattern_name" "$pattern"; then
        VIOLATIONS_FOUND=1
    fi
done

# Additional checks for specific file types
echo "  🔍 Checking for hardcoded credentials in config files..."
config_files=$(find . -name "*.env" -o -name ".env.*" -o -name "config.js" -o -name "config.json" -o -name "*.config.*" | grep -v node_modules | grep -v .git | grep -v ".envrc")

if [ -n "$config_files" ]; then
    for file in $config_files; do
        if [ -f "$file" ]; then
            # Check if env files contain actual values (not just templates)
            if [[ "$file" == *.env* ]] && [[ "$file" != *.example ]] && [[ "$file" != *.template ]]; then
                if grep -E "=.{10,}" "$file" 2>/dev/null | grep -v "example" | grep -v "template" | grep -v "localhost" | grep -v "127.0.0.1" >/dev/null; then
                    echo "    ⚠️  Potential credentials found in $file"
                    echo "    📍 $file: Contains non-template environment variables"
                    VIOLATIONS_FOUND=1
                fi
            fi
        fi
    done
fi

# Check for accidentally committed .env files
echo "  🔍 Checking for .env files..."
if find . -name ".env" -not -path "./node_modules/*" -not -path "./.git/*" | head -1 | read; then
    echo "    ⚠️  Found .env files that should not be committed:"
    find . -name ".env" -not -path "./node_modules/*" -not -path "./.git/*" | while read -r file; do
        echo "    📍 $file"
    done
    VIOLATIONS_FOUND=1
fi

# Clean up
rm -f "$TEMP_FILE"

# Report results
if [ $VIOLATIONS_FOUND -eq 1 ]; then
    echo ""
    echo "❌ Security scan failed!"
    echo "🛑 Found potential security violations. Please review the files above."
    echo "💡 Recommendations:"
    echo "   - Move sensitive data to environment variables"
    echo "   - Use .env.example for templates"
    echo "   - Add sensitive files to .gitignore"
    echo "   - Never commit real API keys or passwords"
    echo ""
    exit 1
else
    echo ""
    echo "✅ Security scan passed!"
    echo "🔒 No sensitive information detected"
    echo ""
fi