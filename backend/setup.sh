#!/bin/bash

# Kalshi Trading Bot Setup Script

echo "🚀 Setting up Kalshi Trading Bot..."

# Create virtual environment
echo "Creating Python virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Create necessary directories
echo "Creating directories..."
mkdir -p logs
mkdir -p keys
mkdir -p data/trades
mkdir -p data/backtest

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your Kalshi API credentials!"
else
    echo ".env already exists, skipping..."
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Add your Kalshi API credentials to .env"
echo "2. Add your private key to keys/kalshi_private_key.pem"
echo "3. Run: source venv/bin/activate"
echo "4. Run: python main.py"
echo ""
echo "📖 See README.md for detailed instructions"
