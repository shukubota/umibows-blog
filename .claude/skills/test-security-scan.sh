#!/bin/bash

# Test Security Scanner
# Creates test files with sensitive data to verify the scanner works

echo "🧪 Testing security scanner..."

# Create temporary test files
mkdir -p /tmp/security-test
cd /tmp/security-test

# Test 1: API Keys
cat > test-api-keys.js << 'EOF'
const apiKey = "ANTHROPIC_API_KEY=sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const openaiKey = "OPENAI_API_KEY=sk-1234567890abcdef1234567890abcdef";
EOF

# Test 2: Private Keys
cat > test-private-key.pem << 'EOF'
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA1234567890abcdef...
-----END RSA PRIVATE KEY-----
EOF

# Test 3: Database URLs
cat > test-db-config.js << 'EOF'
const dbUrl = "mongodb://user:password@cluster.mongodb.net/mydb";
const postgresUrl = "postgres://user:pass@localhost:5432/db";
EOF

# Test 4: JWT Token
cat > test-jwt.js << 'EOF'
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
EOF

# Test 5: .env file
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-api03-real-key-value
DATABASE_URL=postgres://user:password@localhost/db
SECRET_KEY=super-secret-key-123456
EOF

echo "📁 Created test files with sensitive data"

# Run the security scanner on test directory
echo "🔍 Running security scanner on test files..."
if "${OLDPWD}/.claude/skills/security-scan.sh" 2>&1; then
    echo "❌ Test FAILED: Scanner should have detected violations but didn't"
    RESULT=1
else
    echo "✅ Test PASSED: Scanner correctly detected violations"
    RESULT=0
fi

# Clean up
cd - > /dev/null
rm -rf /tmp/security-test

echo ""
if [ $RESULT -eq 0 ]; then
    echo "🎉 Security scanner test completed successfully!"
    echo "🔒 The scanner is working correctly and will catch sensitive data"
else
    echo "💥 Security scanner test failed!"
    echo "⚠️  The scanner may not be working properly"
fi

exit $RESULT