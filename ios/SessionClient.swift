import Foundation

/// A signed chat session from your server.
struct ChatSession: Decodable {
    /// The app page to open: https://octwin.ai/c/app/<widgetId>#from=...&identity=...
    let url: URL
    /// The same signed values, for window.octwin.setIdentity(...) after "identity_refused".
    let from: String
    let identity: String
    let identitySig: String

    enum CodingKeys: String, CodingKey {
        case url, from, identity
        case identitySig = "identity_sig"
    }
}

/// Talks to your server (../server). Your server holds the secrets; the app never does.
enum SessionClient {
    /// Your server. Use https. A tunnel (cloudflared, ngrok) to your Mac works well.
    static let serverURL = "https://your-server.example.com"

    /// The logged-in user. REPLACE THIS WITH YOUR LOGIN.
    /// The sample server trusts this id so you can try it. A real app sends its own
    /// session token, and the server finds the user from it.
    static let demoUserId = "42"

    /// POST /chat/session. Call it each time the chat opens: a session is short-lived.
    static func fetchSession() async throws -> ChatSession {
        let data = try await post("/chat/session", ["userId": demoUserId])
        return try JSONDecoder().decode(ChatSession.self, from: data)
    }

    /// POST /devices. Tells your server where to send this user's pushes.
    static func registerDevice(token: String) async throws {
        _ = try await post("/devices", ["userId": demoUserId, "token": token])
    }

    private static func post(_ path: String, _ body: [String: String]) async throws -> Data {
        guard let url = URL(string: serverURL + path) else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return data
    }
}
