# ============================
# Tech Chef API Smoke Test (SAFE)
# ============================

$ErrorActionPreference = "Continue"

$base = "http://127.0.0.1:5001/minha2pi/southamerica-east1"
$logPath = "D:\dev\criandoAPI\minhaapi\smoke_test_log.txt"

"" | Out-File -FilePath $logPath -Encoding utf8

function Log([string]$msg) {
  $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $line = "[" + $ts + "] " + $msg
  $line | Tee-Object -FilePath $logPath -Append
}

function Pass([string]$msg) { Log ("PASS: " + $msg) }
function Fail([string]$msg) { Log ("FAIL: " + $msg) }
function Info([string]$msg) { Log ("INFO: " + $msg) }

function Unwrap-Data($resp) {
  if ($null -eq $resp) { return $null }
  if ($resp.PSObject.Properties.Name -contains "ok") {
    if ($resp.ok -eq $true) { return $resp.data }
    else { return $null }
  }
  return $resp
}

function Invoke-Api([string]$method, [string]$url, $bodyObj = $null) {
  try {
    if ($null -ne $bodyObj) {
      $json = $bodyObj | ConvertTo-Json -Depth 20
      return Invoke-RestMethod -Method $method -Uri $url -ContentType "application/json" -Body $json
    } else {
      return Invoke-RestMethod -Method $method -Uri $url
    }
  } catch {
    try {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $errBody = $reader.ReadToEnd()
      return @{ __error = $true; __raw = $errBody }
    } catch {
      return @{ __error = $true; __raw = $_.Exception.Message }
    }
  }
}

$failed = $false
$foodId = $null
$recipeId = $null

Info ("Starting smoke test...")
Info ("BASE = " + $base)
Info ("LOG  = " + $logPath)

# Test 0: debugEnv
Info ("Test 0: GET /debugEnv")
$resp = Invoke-Api "GET" ($base + "/debugEnv")
if ($resp.__error) { Fail ("debugEnv failed: " + $resp.__raw); $failed = $true }
else { Pass ("debugEnv ok") }

# Test 1: foods list
Info ("Test 1: GET /foods?limit=3")
$resp = Invoke-Api "GET" ($base + "/foods?limit=3")
if ($resp.__error) {
  Fail ("/foods failed: " + $resp.__raw); $failed = $true
} else {
  $data = Unwrap-Data $resp
  if ($null -eq $data) { $data = $resp }

  $items = $null

  # Se vier como PSCustomObject com propriedade "items"
  if ($data -and ($data.PSObject.Properties.Name -contains "items")) {
    $items = $data.items
  }
  # Se vier como IDictionary com chave "items"
  elseif ($data -is [System.Collections.IDictionary] -and $data.Contains("items")) {
    $items = $data.items
  }
  # Caso antigo: /foods retorna lista direta
  else {
    $items = $data
  }

  if ($null -eq $items -or $items.Count -lt 1) {
    Fail ("/foods returned empty (import not loaded in this emulator?)")
    $failed = $true
  } else {
    Pass ("/foods returned " + $items.Count + " item(s)")
    $first = $items[0]
    foreach ($k in @("id","docId","foodId")) {
      if ($first.PSObject.Properties.Name -contains $k) { $foodId = [string]$first.$k; break }
    }
    if (-not $foodId) {
      Fail ("Could not capture foodId. First item: " + ($first | ConvertTo-Json -Depth 10))
      $failed = $true
    } else {
      Info ("Selected foodId = " + $foodId)
    }
  }
}

# Test 2: food by id
if ($foodId) {
  Info ("Test 2: GET /food?id=" + $foodId)
  $resp = Invoke-Api "GET" ($base + "/food?id=" + $foodId)
  if ($resp.__error) { Fail ("/food failed: " + $resp.__raw); $failed = $true }
  else {
    $data = Unwrap-Data $resp
    if ($null -eq $data) { $data = $resp }

    if (-not ($data.PSObject.Properties.Name -contains "name_pt")) {
      Fail ("/food missing name_pt. Response: " + ($data | ConvertTo-Json -Depth 10))
      $failed = $true
    } else {
      Pass ("/food ok, name_pt=" + $data.name_pt)
    }
  }
} else {
  Info ("Skipping Test 2 (no foodId).")
}

# Test 3: create recipe
Info ("Test 3: POST /recipes")
$bodyRecipe = @{ name_pt="Receita Teste Auto"; servings=2; description="teste automatico" }
$resp = Invoke-Api "POST" ($base + "/recipes") $bodyRecipe
if ($resp.__error) {
  Fail ("POST /recipes failed: " + $resp.__raw); $failed = $true
} else {
  $data = Unwrap-Data $resp
  if ($null -eq $data) { $data = $resp }

  if ($data.PSObject.Properties.Name -contains "id") { $recipeId = [string]$data.id }
  elseif ($resp.PSObject.Properties.Name -contains "id") { $recipeId = [string]$resp.id }

  if (-not $recipeId) {
    Fail ("Could not capture recipeId. Response: " + ($resp | ConvertTo-Json -Depth 10))
    $failed = $true
  } else {
    Pass ("Recipe created id=" + $recipeId)
  }
}

# Test 4: add ingredient
if ($recipeId -and $foodId) {
  Info ("Test 4: POST /recipeAddIngredient?id=" + $recipeId)
  $bodyIng = @{ foodId=$foodId; grams=100; order=1 }
  $resp = Invoke-Api "POST" ($base + "/recipeAddIngredient?id=" + $recipeId) $bodyIng
  if ($resp.__error) {
    Fail ("recipeAddIngredient failed: " + $resp.__raw); $failed = $true
  } else {
    Pass ("Ingredient added foodId=" + $foodId + " grams=100")
  }
} else {
  Info ("Skipping Test 4 (missing recipeId or foodId).")
}

# Test 5: recipe nutrition
if ($recipeId) {
  Info ("Test 5: GET /recipeNutrition?id=" + $recipeId)
  $resp = Invoke-Api "GET" ($base + "/recipeNutrition?id=" + $recipeId)
  if ($resp.__error) {
    Fail ("recipeNutrition failed: " + $resp.__raw); $failed = $true
  } else {
    $data = Unwrap-Data $resp
    if ($null -eq $data) { $data = $resp }

    $totals = $null
    if ($data.PSObject.Properties.Name -contains "totals") { $totals = $data.totals }
    elseif ($resp.PSObject.Properties.Name -contains "totals") { $totals = $resp.totals }

    if ($null -eq $totals) {
      Fail ("recipeNutrition missing totals. Response: " + ($data | ConvertTo-Json -Depth 10))
      $failed = $true
    } else {
      Pass ("recipeNutrition totals keys=" + $totals.PSObject.Properties.Count)
      $shown = 0
      foreach ($p in $totals.PSObject.Properties) {
        Info ("  total." + $p.Name + "=" + $p.Value)
        $shown++
        if ($shown -ge 5) { break }
      }
    }
  }
} else {
  Info ("Skipping Test 5 (no recipeId).")
}

# Summary
if ($failed) {
  Fail ("SMOKE TEST FINISHED WITH FAILURES")
} else {
  Pass ("SMOKE TEST OK")
}

Info ("Log saved at: " + $logPath)
Read-Host "Press ENTER to finish (window will stay open)"
