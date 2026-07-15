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

Write-Host ""
Write-Host "Done! All assets copied."
