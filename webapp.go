package main

import (
    "encoding/json"
    "fmt"
    "html/template"
    "log"
    "net/http"
    "os"
    "os/exec"
    "strings"
)

type Recipe struct {
    Ingredients []string `json:"ingredients"`
    Directions  []string `json:"directions"`
}

func main() {
    http.HandleFunc("/", homeHandler)
    http.HandleFunc("/extract", extractHandler)
    
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    
    log.Printf("Server starting on port %s", port)
    log.Fatal(http.ListenAndServe(":"+port, nil))
}

func homeHandler(w http.ResponseWriter, r *http.Request) {
    tmpl := `<!DOCTYPE html>
<html>
<head>
    <title>Recipe Extractor</title>
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .form-group { margin-bottom: 20px; }
        input[type="url"] { width: 100%; padding: 10px; font-size: 16px; }
        button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
        button:hover { background: #0056b3; }
        .recipe { margin-top: 20px; }
        .ingredients, .directions { margin-bottom: 20px; }
        .ingredients h3, .directions h3 { color: #333; }
        .ingredients ul, .directions ol { padding-left: 20px; }
        .loading { color: #666; font-style: italic; }
    </style>
</head>
<body>
    <h1>Recipe Extractor</h1>
    <form hx-post="/extract" hx-target="#recipe-result" hx-indicator="#loading">
        <div class="form-group">
            <label for="url">Recipe URL:</label>
            <input type="url" id="url" name="url" placeholder="https://example.com/recipe" required>
        </div>
        <button type="submit">Extract Recipe</button>
    </form>
    
    <div id="loading" class="htmx-indicator loading">Extracting recipe...</div>
    <div id="recipe-result"></div>
</body>
</html>`
    
    t, _ := template.New("home").Parse(tmpl)
    t.Execute(w, nil)
}

func extractHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != "POST" {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    
    url := r.FormValue("url")
    if url == "" {
        http.Error(w, "URL is required", http.StatusBadRequest)
        return
    }
    
    // Call the MCP server to extract recipe
    cmd := exec.Command("go", "run", "romplin-recipe.go")
    cmd.Stdin = strings.NewReader(fmt.Sprintf(`{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "extract_recipe", "arguments": {"url": "%s"}}}`, url))
    
    output, err := cmd.Output()
    if err != nil {
        log.Printf("Error calling MCP server: %v", err)
        w.WriteHeader(http.StatusInternalServerError)
        fmt.Fprintf(w, `<div class="recipe"><p style="color: red;">Error extracting recipe: %v</p></div>`, err)
        return
    }
    
    // Parse the MCP response
    var response struct {
        Result struct {
            Content []struct {
                Text string `json:"text"`
            } `json:"content"`
        } `json:"result"`
    }
    
    if err := json.Unmarshal(output, &response); err != nil {
        log.Printf("Error parsing MCP response: %v", err)
        w.WriteHeader(http.StatusInternalServerError)
        fmt.Fprintf(w, `<div class="recipe"><p style="color: red;">Error parsing response</p></div>`)
        return
    }
    
    if len(response.Result.Content) == 0 {
        fmt.Fprintf(w, `<div class="recipe"><p>No recipe found at this URL</p></div>`)
        return
    }
    
    recipeText := response.Result.Content[0].Text
    parts := strings.Split(recipeText, "\n\nDIRECTIONS:")
    
    var ingredients, directions []string
    
    if len(parts) > 0 {
        ingredientsText := strings.TrimPrefix(parts[0], "INGREDIENTS:\n")
        ingredients = strings.Split(ingredientsText, "\n")
    }
    
    if len(parts) > 1 {
        directionsText := strings.TrimSpace(parts[1])
        directions = strings.Split(directionsText, "\n")
    }
    
    // Generate HTML response
    html := `<div class="recipe">`
    
    if len(ingredients) > 0 && ingredients[0] != "" {
        html += `<div class="ingredients"><h3>Ingredients:</h3><ul>`
        for _, ingredient := range ingredients {
            if strings.TrimSpace(ingredient) != "" {
                html += fmt.Sprintf(`<li>%s</li>`, strings.TrimSpace(ingredient))
            }
        }
        html += `</ul></div>`
    }
    
    if len(directions) > 0 && directions[0] != "" {
        html += `<div class="directions"><h3>Directions:</h3><ol>`
        for _, direction := range directions {
            if strings.TrimSpace(direction) != "" {
                html += fmt.Sprintf(`<li>%s</li>`, strings.TrimSpace(direction))
            }
        }
        html += `</ol></div>`
    }
    
    if len(ingredients) == 0 && len(directions) == 0 {
        html += `<p>No ingredients or directions found. The recipe format might not be supported.</p>`
    }
    
    html += `</div>`
    
    w.Header().Set("Content-Type", "text/html")
    fmt.Fprint(w, html)
}