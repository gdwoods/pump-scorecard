#!/bin/bash
# Fix: Move the commit from main to feature branch

set -e

echo "🔧 Fixing branch: Moving commit from main to feature branch"
echo ""

# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Current branch: $CURRENT_BRANCH"
echo ""

if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "⚠️  Warning: Not on 'main' branch. Switching to main..."
    git checkout main
fi

# Save the commit hash
LAST_COMMIT=$(git rev-parse HEAD)
echo "Last commit: $LAST_COMMIT"
echo ""

# Create feature branch from current position (includes the watchlist commit)
echo "🌿 Creating feature branch from current commit..."
git checkout -b feature/watchlist-functionality
echo "✓ Created feature branch with watchlist commit"
echo ""

# Go back to main and reset to before the watchlist commit
echo "↩️  Resetting main branch to before watchlist commit..."
git checkout main
git reset --hard HEAD~1
echo "✓ Main branch restored to previous state"
echo ""

# Switch back to feature branch
git checkout feature/watchlist-functionality
echo ""

# Show status
echo "✅ Done! Current status:"
echo ""
echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
echo "Commit: $(git rev-parse HEAD)"
echo ""
echo "📝 Next step:"
echo "   git push -u origin feature/watchlist-functionality"
