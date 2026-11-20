# Setup and verify embeddinggemma-2:270m in Ollama with CPU throttling
$env:OLLAMA_NUM_THREAD = "4"
$env:OLLAMA_KEEP_ALIVE = "5m"
$env:OLLAMA_HOST = "127.0.0.1:11434"

[System.Environment]::SetEnvironmentVariable("OLLAMA_NUM_THREAD", "4", "User")
[System.Environment]::SetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "5m", "User")
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "127.0.0.1:11434", "User")

Write-Host "Checking for Ollama CLI..." -ForegroundColor Cyan
if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Write-Host "Pulling embeddinggemma-2:270m..." -ForegroundColor Green
    ollama pull embeddinggemma-2:270m

    Write-Host "Testing embeddings endpoint at http://127.0.0.1:11434/v1/embeddings..." -ForegroundColor Cyan
    try {
        $body = @{
            model = "embeddinggemma-2:270m"
            input = "test embedding gemma 2"
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/v1/embeddings" -Method Post -ContentType "application/json" -Body $body
        $dim = $response.data[0].embedding.Count
        Write-Host "Success: Ollama returned vector with dimension $dim." -ForegroundColor Green
    } catch {
        Write-Warning "Could not connect to Ollama endpoint: $_"
    }

    if (Get-Command deeptutor -ErrorAction SilentlyContinue) {
        Write-Host "Applying DeepTutor configuration..." -ForegroundColor Cyan
        deeptutor config apply scripts/deeptutor_setup.json --check
        deeptutor config apply scripts/deeptutor_setup.json
        deeptutor doctor --format json
    } else {
        Write-Host "DeepTutor CLI not found in PATH; configuration ready at scripts/deeptutor_setup.json" -ForegroundColor Yellow
    }
} else {
    Write-Warning "Ollama is not installed or not in PATH."
    Write-Host "To install Ollama, run: winget install Ollama.Ollama" -ForegroundColor Yellow
    Write-Host "Once installed and started, rerun this script to pull embeddinggemma-2:270m." -ForegroundColor Yellow
}
