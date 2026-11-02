$ErrorActionPreference = 'Stop'
$word = $null
$doc = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.AutomationSecurity = 3
    foreach ($format in @('doc','docx')) {
        $path = Join-Path (Get-Location) ".word-test-output/exemplo.$format"
        $doc = $word.Documents.Open($path, $false, $true, $false)
        $text = $doc.Content.Text
        if (-not $text.Contains('Fim da história.')) { throw "Conteúdo ausente em $format" }
        if ($doc.Tables.Count -ne 1) { throw "Tabela ausente em $format" }
        if ($doc.InlineShapes.Count -lt 2) { throw "Imagem ausente em $format" }
        Write-Output "$format aberto no Word: $($doc.Tables.Count) tabela, $($doc.InlineShapes.Count) imagens."
        $doc.Close(0)
        $doc = $null
    }
} finally {
    if ($doc) { $doc.Close(0) }
    if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
}
