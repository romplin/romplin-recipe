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
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>romplin-recipe</title>
    <script src="https://unpkg.com/htmx.org@2.0.3"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
    <div class="content-wrapper">
        <div class="hero">
            <div class="logo-placeholder">
                <img src="/static/logo.png" alt="romplin-recipe logo">
            </div>
            <h1>romplin-recipe</h1>
            <div class="tagline">extract recipes from any website</div>
            <div class="nav-links">
                <a href="https://romplin-labs.com">romplin-labs</a>
                <a href="https://romplin-arena.com">romplin-arena</a>
            </div>
        </div>

        <section class="extraction-section">
            <h2>extract recipe</h2>
            <form class="extraction-form" hx-post="/extract" hx-target="#recipe-result" hx-indicator="#loading">
                <div class="form-group">
                    <label for="url">recipe url</label>
                    <input type="url" id="url" name="url" placeholder="https://example.com/recipe" required>
                </div>
                <button type="submit" class="submit-btn">extract recipe</button>
            </form>
            <div id="loading" class="htmx-indicator loading">extracting recipe...</div>
        </section>

        <div id="recipe-result"></div>

        <footer>
            <div class="social-links">
                <a href="https://github.com/romplin" target="_blank">github</a>
                <a href="https://x.com/romplin333" target="_blank">x</a>
                <a href="https://discord.gg/4WeS3ddPVq" target="_blank">discord</a>
            </div>
            <p>© 2025 romplin-labs.</p>
        </footer>
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
