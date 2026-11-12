function Read-VerifiedUpdateManifest {
    param([string]$ManifestPath,[string]$SignaturePath,[string]$PublicKeyPath=(Join-Path $PSScriptRoot 'update-public.xml'))
    if ((Get-Item -LiteralPath $ManifestPath).Length -gt 16384 -or (Get-Item -LiteralPath $SignaturePath).Length -gt 16384) { throw 'Signed manifest or signature is too large.' }
    $bytes = [IO.File]::ReadAllBytes($ManifestPath)
    if ($bytes.Length -gt 16384) { throw 'Signed manifest is too large.' }
    $signature = [Convert]::FromBase64String([IO.File]::ReadAllText($SignaturePath).Trim())
    $rsa = [Security.Cryptography.RSA]::Create()
    try {
        $rsa.FromXmlString([IO.File]::ReadAllText($PublicKeyPath))
        if ($rsa.KeySize -lt 2048) { throw 'Release verification key is too weak.' }
        if (!$rsa.VerifyData($bytes,$signature,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)) { throw 'Release signature is invalid.' }
    } finally { $rsa.Dispose() }
    $jsonOptions = @{}
    # PowerShell 7.5 converts ISO strings to DateTime unless explicitly disabled.
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey("DateKind")) { $jsonOptions.DateKind = "String" }
    $json = [Text.UTF8Encoding]::new($false,$true).GetString($bytes)
    if (!$json.TrimStart().StartsWith("{")) { throw "Signed manifest must be a JSON object." }
    $data = $json | ConvertFrom-Json @jsonOptions
    if ($data -isnot [pscustomobject] -or ($data.schemaVersion -isnot [long] -and $data.schemaVersion -isnot [int]) -or $data.schemaVersion -ne 1 -or $data.extensionId -isnot [string] -or $data.extensionId -cne 'com.aeexpressioneditor.panel') { throw 'Wrong signed release identity.' }
    if ($data.version -isnot [string] -or $data.version -cnotmatch '^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$') { throw 'Invalid signed version.' }
    if ($data.assetName -isnot [string] -or $data.assetName -cne "Expression-Studio-$($data.version).zip" -or $data.sha256 -isnot [string] -or $data.sha256 -cnotmatch '^[a-f0-9]{64}$' -or ($data.size -isnot [long] -and $data.size -isnot [int]) -or $data.size -le 0 -or $data.size -gt 100MB) { throw 'Invalid signed package metadata.' }
    if ($data.releaseUrl -isnot [string] -or $data.releaseUrl -cne "https://github.com/rodrigoblergh/expression-studio/releases/tag/v$($data.version)") { throw 'Wrong signed repository.' }
    $datePattern = '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$'
    if ($data.publishedAt -isnot [string] -or $data.expiresAt -isnot [string] -or $data.publishedAt -cnotmatch $datePattern -or $data.expiresAt -cnotmatch $datePattern) { throw 'Invalid signed release dates.' }
    $now = [DateTimeOffset]::UtcNow
    $published = [DateTimeOffset]::Parse($data.publishedAt,[Globalization.CultureInfo]::InvariantCulture)
    $expires = [DateTimeOffset]::Parse($data.expiresAt,[Globalization.CultureInfo]::InvariantCulture)
    if ($expires -le $now -or $published -gt $now.AddMinutes(10) -or $expires -le $published) { throw 'Release signature has expired or has invalid dates.' }
    return $data
}
