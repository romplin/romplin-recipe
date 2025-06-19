FROM golang:1.23.4-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the applications
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o webapp webapp.go
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o mcp-server romplin-recipe.go

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy binaries from builder stage
COPY --from=builder /app/webapp .
COPY --from=builder /app/mcp-server .

# Expose port
EXPOSE 8080

# Run webapp
CMD ["./webapp"]