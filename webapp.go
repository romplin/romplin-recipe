package main

import (
    "fmt"
    "html/template"
    "log"
    "net/http"
    "os"
    "strings"

    "github.com/PuerkitoBio/goquery"
)

type Recipe struct {
    Ingredients []string `json:"ingredients"`
    Directions  []string `json:"directions"`
}

func main() {
    http.HandleFunc("/", homeHandler)
    http.HandleFunc("/extract", extractHandler)
    http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static/"))))
    
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
    <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
    <div class="container">
        <div class="logo-container">
            <img src="/static/logo.png" alt="Romplin Recipe Logo" class="logo">
        </div>
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
    </div>
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
    
    // Fetch and parse the recipe directly
    resp, err := http.Get(url)
    if err != nil {
        log.Printf("Error fetching URL: %v", err)
        w.WriteHeader(http.StatusInternalServerError)
        fmt.Fprintf(w, `<div class="recipe"><p style="color: red;">Error fetching recipe: %v</p></div>`, err)
        return
    }
    defer resp.Body.Close()

    doc, err := goquery.NewDocumentFromReader(resp.Body)
    if err != nil {
        log.Printf("Error parsing HTML: %v", err)
        w.WriteHeader(http.StatusInternalServerError)
        fmt.Fprintf(w, `<div class="recipe"><p style="color: red;">Error parsing recipe page</p></div>`)
        return
    }

    var ingredients []string
    var directions []string

    // Common selectors for ingredients
    doc.Find("li[itemprop='recipeIngredient'], .recipe-ingredient, .ingredients li, [data-ingredient], .ingredient").Each(func(i int, s *goquery.Selection) {
        text := strings.TrimSpace(s.Text())
        if text != "" {
            ingredients = append(ingredients, text)
        }
    })

    // Common selectors for directions/instructions
    doc.Find("li[itemprop='recipeInstructions'], .recipe-instruction, .instructions li, [data-instruction], .instruction, .directions li").Each(func(i int, s *goquery.Selection) {
        text := strings.TrimSpace(s.Text())
        if text != "" {
            directions = append(directions, text)
        }
    })
    
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
