# Quality Commit Skill

**Skill Name**: `quality-commit`

## Description
Automatically runs Prettier formatting, ESLint checks, and security scanning before committing code to ensure consistent code quality and security across the repository.

## Workflow

1. **Format Code**: Run `npm run format` to ensure all files are properly formatted with Prettier
2. **Lint Check**: Run `npm run lint` to check for code quality issues
3. **Security Scan**: Scan all files for API keys, tokens, and sensitive data
4. **Stage Changes**: Add all formatted files to git staging area
5. **Commit**: Create commit with descriptive message if all checks pass
6. **Rollback**: If any checks fail, provide clear error message and guidance

## Usage

Invoke this skill when you want to commit code with automatic quality and security checks:
- "quality commit"
- "secure commit"
- "commit with checks"
- "safe commit"
- "commit formatted"

## Security Checks

Scans for the following sensitive patterns:
- **API Keys**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AWS_ACCESS_KEY`, etc.
- **Tokens**: JWT tokens, OAuth tokens, GitHub tokens
- **Passwords**: Hardcoded passwords and credentials
- **Private Keys**: RSA, SSH, certificate private keys
- **Database URLs**: MongoDB, PostgreSQL, MySQL connection strings
- **Secret Values**: Any hardcoded secrets or sensitive configuration

## Implementation

```bash
# 1. Format all code
npm run format

# 2. Check for linting errors
npm run lint

# 3. Security scan for sensitive data
./security-scan.sh

# 4. If all pass, stage and commit
git add .
git commit -m "Your commit message"

# 5. If any fails, report errors and abort
```

## Error Handling

- **Prettier errors**: Auto-fix formatting issues and re-stage files
- **ESLint errors**: Report specific errors and line numbers for manual fix
- **Security violations**: Block commit and report exact file/line locations
- **Git errors**: Handle merge conflicts and staging issues
- **Rollback**: Restore original state if any step fails

## Benefits

- Ensures consistent code formatting across all commits
- Catches code quality issues before they enter the repository
- Prevents accidental exposure of sensitive information
- Maintains clean git history with properly formatted and secure code
- Reduces security vulnerabilities and code review overhead