# Copy all assets from main app public/ to website/public/
$src = Join-Path (Get-Location).Parent.FullName "public"
$dst = Join-Path (Get-Location) "public"

Write-Host "Copying from: $src"
Write-Host "Copying to:   $dst"
Write-Host ""

Get-ChildItem $src -Filter "RemiAI*" | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $dst $_.Name) -Force
    Write-Host "  ✓ $($_.Name)"
}

Get-ChildItem $src -Filter "favicon*" | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $dst $_.Name) -Force
    Write-Host "  ✓ $($_.Name)"
}

Get-ChildItem $src -Filter "icon-*" | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $dst $_.Name) -Force
    Write-Host "  ✓ $($_.Name)"
}

if (Test-Path (Join-Path $src "apple-touch-icon.png")) {
    Copy-Item (Join-Path $src "apple-touch-icon.png") (Join-Path $dst "apple-touch-icon.png") -Force
    Write-Host "  ✓ apple-touch-icon.png"
}

Write-Host ""
# manifest.json intentionally NOT copied: website keeps its own light-themed manifest
Write-Host "Done! All assets copied."
