$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Verify-Update.ps1')
$testRoot=[IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('ExpressionStudio-signature-tests-'+[guid]::NewGuid().ToString('N'))))
[IO.Directory]::CreateDirectory($testRoot)|Out-Null
$rsa=[Security.Cryptography.RSA]::Create(2048)
$other=[Security.Cryptography.RSA]::Create(2048)
$manifest=Join-Path $testRoot 'update-manifest.json'; $signature=Join-Path $testRoot 'update-manifest.sig'; $public=Join-Path $testRoot 'update-public.xml'
[IO.File]::WriteAllText($public,$rsa.ToXmlString($false))
$count=0
function New-TestManifest {
    $now=[DateTimeOffset]::UtcNow
    return [ordered]@{schemaVersion=1;extensionId='com.aeexpressioneditor.panel';version='1.0.1';assetName='Expression-Studio-1.0.1.zip';sha256=('a'*64);size=123;releaseUrl='https://github.com/rodrigoblergh/expression-studio/releases/tag/v1.0.1';publishedAt=$now.AddMinutes(-1).ToString('o');expiresAt=$now.AddDays(2).ToString('o')}
}
function Write-TestManifest($Data) {
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Data|ConvertTo-Json -Compress -Depth 10))
    [IO.File]::WriteAllBytes($manifest,$bytes)
    [IO.File]::WriteAllText($signature,[Convert]::ToBase64String($rsa.SignData($bytes,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)))
}
function Assert-Rejected([string]$Name,[scriptblock]$Action) {
    $rejected=$false
    try { & $Action | Out-Null } catch { $rejected=$true }
    if (!$rejected) { throw "FAIL: $Name was accepted" }
    $script:count++; Write-Output "PASS: $Name"
}
try {
    Write-TestManifest (New-TestManifest)
    $valid=Read-VerifiedUpdateManifest $manifest $signature $public
    if ($valid.version -ne '1.0.1') {throw 'Valid signed manifest failed'}
    $count++;Write-Output 'PASS: valid signed manifest'
    [IO.File]::AppendAllText($manifest,' ')
    Assert-Rejected 'tampered manifest bytes' {Read-VerifiedUpdateManifest $manifest $signature $public}
    Write-TestManifest (New-TestManifest)
    $wrongPublic=Join-Path $testRoot 'wrong-public.xml';[IO.File]::WriteAllText($wrongPublic,$other.ToXmlString($false))
    Assert-Rejected 'wrong public key' {Read-VerifiedUpdateManifest $manifest $signature $wrongPublic}
    foreach($case in @(
        @('wrong extension ID','extensionId','other.panel'),
        @('wrong schema','schemaVersion',2),
        @('boolean schema','schemaVersion',$true),
        @('prerelease version','version','1.0.1-beta'),
        @('leading-zero version','version','01.0.1'),
        @('unbounded version','version','999999999999999999.0.1'),
        @('wrong repository','releaseUrl','https://github.com/other/repo/releases/tag/v1.0.1'),
        @('wrong asset name','assetName','Expression-Studio-2.0.0.zip'),
        @('short hash','sha256','a'),
        @('uppercase hash','sha256',('A'*64)),
        @('nonhex hash','sha256',('z'*64)),
        @('array hash','sha256',@('a'*64)),
        @('zero size','size',0),
        @('negative size','size',-1),
        @('oversized package','size',104857601),
        @('boolean size','size',$true),
        @('fractional size','size',1.5),
        @('string size','size','123'),
        @('expired manifest','expiresAt',[DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('o')),
        @('future publication','publishedAt',[DateTimeOffset]::UtcNow.AddHours(1).ToString('o')),
        @('unqualified timestamp','publishedAt','2026-11-12'),
        @('nonstrings timestamp','publishedAt',42)
    )) {
        $data=New-TestManifest;$data[$case[1]]=$case[2];Write-TestManifest $data
        Assert-Rejected $case[0] {Read-VerifiedUpdateManifest $manifest $signature $public}
    }
    $data=New-TestManifest;$data.publishedAt=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o');$data.expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(4).ToString('o');Write-TestManifest $data
    Assert-Rejected 'expiry before publication' {Read-VerifiedUpdateManifest $manifest $signature $public}
    Write-TestManifest (New-TestManifest)
    $arrayBytes=[Text.UTF8Encoding]::new($false).GetBytes(('['+[IO.File]::ReadAllText($manifest)+']'))
    [IO.File]::WriteAllBytes($manifest,$arrayBytes)
    [IO.File]::WriteAllText($signature,[Convert]::ToBase64String($rsa.SignData($arrayBytes,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)))
    Assert-Rejected 'signed top-level array' {Read-VerifiedUpdateManifest $manifest $signature $public}
    Write-TestManifest (New-TestManifest);[IO.File]::WriteAllText($signature,'not-base64')
    Assert-Rejected 'malformed signature' {Read-VerifiedUpdateManifest $manifest $signature $public}
    [IO.File]::WriteAllText($signature,('a'*16385))
    Assert-Rejected 'oversized signature' {Read-VerifiedUpdateManifest $manifest $signature $public}
    Write-TestManifest (New-TestManifest);[IO.File]::WriteAllText($manifest,('a'*16385))
    Assert-Rejected 'oversized manifest' {Read-VerifiedUpdateManifest $manifest $signature $public}
    # Exercise the real signing script in an isolated copy using only temporary keys.
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Sign-Release.ps1'),(Join-Path $PSScriptRoot 'Verify-Update.ps1') -Destination $testRoot
    $private=Join-Path $testRoot 'temporary-private.pem';[IO.File]::WriteAllText($private,$rsa.ExportPkcs8PrivateKeyPem())
    $package=Join-Path $testRoot 'Expression-Studio-1.0.1.zip';[IO.File]::WriteAllBytes($package,[byte[]](1,2,3,4))
    & (Join-Path $testRoot 'Sign-Release.ps1') -Package $package -PrivateKey $private -ValidDays 2 | Out-Null
    $signed=Read-VerifiedUpdateManifest $manifest $signature $public
    if ($signed.size -ne 4 -or $signed.sha256 -cne (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant()) {throw 'Signer produced wrong package metadata'}
    $count++;Write-Output 'PASS: signing and verification integration with temporary RSA key'
    Write-Output "PASS: $count signature validation checks"
} finally {
    $rsa.Dispose();$other.Dispose()
    $tempParent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
    if (!$testRoot.StartsWith($tempParent,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($testRoot) -notlike 'ExpressionStudio-signature-tests-*') {throw 'Unexpected test cleanup path'}
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
