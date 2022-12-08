import { createParser } from "eventsource-parser";
import ExpiryMap from "expiry-map";
import fetch from "node-fetch";
import ora from "ora";
import { v4 as uuidv4 } from "uuid";

// Thanks to https://github.com/RomanHotsiy/commitgpt for the foundation of this

const spinner = ora();

export type ClientConfig = {
  sessionToken: string;
};

const KEY_ACCESS_TOKEN = "accessToken";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36";
const cache = new ExpiryMap(10 * 1000);

export async function refreshAccessToken(sessionToken: string) {
  if (cache.get(KEY_ACCESS_TOKEN)) {
    return cache.get(KEY_ACCESS_TOKEN);
  }
  const resp = await fetch("https://chat.openai.com/api/auth/session", {
    headers: {
      "User-Agent": USER_AGENT,
      cookie: "__Secure-next-auth.session-token=" + sessionToken,
    },
  })
    .then((r) => r.json() as any)
    .catch(() => ({}));

  if (!resp.accessToken) {
    throw new Error("Unathorized");
  }

  cache.set(KEY_ACCESS_TOKEN, resp.accessToken);
  return resp.accessToken;
}

export class ChatGPTClient {
  constructor(
    public config: ClientConfig,
    public converstationId: string = "",
    public parentId = uuidv4(),
    public firstRequest = true
  ) {}

  async ensureAuth() {
    await refreshAccessToken(this.config.sessionToken);
  }
  async getAnswer(question: string): Promise<string> {
    const accessToken = await refreshAccessToken(this.config.sessionToken);

    let response = "";
    const id = uuidv4();

    const body = {
      action: "next",
      messages: [
        {
          id,
          role: "user",
          content: {
            content_type: "text",
            parts: [question],
          },
        },
      ],
      model: "text-davinci-002-render",
      conversation_id: this.converstationId,
      parent_message_id: this.parentId,
    };

    spinner.start(this.firstRequest ? "Starting Game" : "Loading");

    if (this.firstRequest) {
      delete body.conversation_id;
      this.firstRequest = false;
    }

    let firstResponse = true;

    return new Promise((resolve, reject) => {
      this.fetchSSE("https://chat.openai.com/backend-api/conversation", {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        onMessage: (message: string) => {
          if (firstResponse) {
            spinner.stop();
            console.log("");
            firstResponse = false;
          }
          if (message === "[DONE]") {
            console.log("");
            return resolve(response);
          }
          const data = JSON.parse(message);
          const text: string = data.message?.content?.parts?.[0];
          this.parentId = data.message.id;

          if (!this.converstationId) {
            this.converstationId = data.conversation_id;
          }

          if (!!text) {
            process.stdout.write(text.substring(response.length));
          }

          if (text) {
            response = text;
          }
        },
      }).catch(reject);
    });
  }

  async fetchSSE(resource, options) {
    const { onMessage, ...fetchOptions } = options;
    const resp = await fetch(resource, fetchOptions);
    if (!resp.ok) {
      throw new Error("Failed to fetch - " + resp.statusText);
    }
    const parser = createParser((event) => {
      if (event.type === "event") {
        onMessage(event.data);
      }
    });

    resp.body.on("readable", () => {
      let chunk;
      while (null !== (chunk = resp.body.read())) {
        parser.feed(chunk.toString());
      }
    });
  }
}
