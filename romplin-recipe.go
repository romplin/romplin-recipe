package main

import (
    "context"
    "fmt"
    "net/http"
    "strings"

    "github.com/PuerkitoBio/goquery"
    "github.com/mark3labs/mcp-go/mcp"
    "github.com/mark3labs/mcp-go/server"
)

func main() {
    // Create a new MCP server
    s := server.NewMCPServer(
        "Recipe Extractor",
        "1.0.0",
        server.WithResourceCapabilities(true, true),
        server.WithLogging(),
    )

    // Add recipe extraction tool
    extractRecipeTool := mcp.NewTool("extract_recipe",
        mcp.WithDescription("Extract ingredients and directions from a recipe URL"),
        mcp.WithString("url",
            mcp.Required(),
            mcp.Description("The recipe URL to extract from"),
        ),
    )

    // Add the recipe extraction handler
    s.AddTool(extractRecipeTool, func(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
        args, ok := request.Params.Arguments.(map[string]interface{})
        if !ok {
            return nil, fmt.Errorf("invalid arguments format")
        }
        url, ok := args["url"].(string)
        if !ok {
            return nil, fmt.Errorf("url parameter is required and must be a string")
        }
        
        resp, err := http.Get(url)
        if err != nil {
            return nil, fmt.Errorf("failed to fetch URL: %v", err)
        }
        defer resp.Body.Close()

        doc, err := goquery.NewDocumentFromReader(resp.Body)
        if err != nil {
            return nil, fmt.Errorf("failed to parse HTML: %v", err)
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

        result := fmt.Sprintf("INGREDIENTS:\n%s\n\nDIRECTIONS:\n%s", 
            strings.Join(ingredients, "\n"), 
            strings.Join(directions, "\n"))

        return mcp.NewToolResultText(result), nil
    })

    // Start the server
    if err := server.ServeStdio(s); err != nil {
        fmt.Printf("Server error: %v\n", err)
    }
}
