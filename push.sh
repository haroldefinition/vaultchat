#!/bin/bash
git add .
echo "Files prepared for saving..."
read -p "What did you change? " msg
git commit -m "$msg"
git push origin main
echo "--- Done! Your code is now on GitHub. ---"
