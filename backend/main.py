import os
from flask import Flask, jsonify, request
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Basic health check endpoint."""
    return jsonify({
        "status": "healthy",
        "message": "API is running smoothly."
    })

@app.route('/api/echo', methods=['POST'])
def echo():
    """Example POST endpoint that echoes back the JSON payload."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400
    return jsonify({
        "message": "Data received successfully",
        "data": data
    })

def main():
    port = os.getenv("SERVER_PORT")
    port = int(port)
    app.run(host='0.0.0.0', port=port, debug=True)

if __name__ == '__main__':
    main()