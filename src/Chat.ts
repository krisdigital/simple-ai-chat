import { html, css, LitElement } from "lit-element";
import { property } from "lit-element/decorators.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { marked } from "marked";
import DOMPurify from "dompurify";

import OpenAI from "openai";

type Role = "assistant" | "user";

type Message = {
  role: Role;
  content: string;
  createdAt: number;
};

const promptTemplate = (role: Role) =>
  html`<h3 class="${role}">
    ${role === "assistant" ? "🤖 Friendly Bot" : "🧑‍💻 You"}
  </h3>`;

const textBlock = (chunks: string[]) =>
  html`${unsafeHTML(DOMPurify.sanitize(<string>marked.parse(chunks.join(""))))}`;

const makeBlocks = (messages: Message[]) => {
  let lastAuthor: Role | undefined;
  let chunkBuffer: string[] = [];
  let currentBlocks = [html``];

  for (const m of messages) {
    if (!lastAuthor || lastAuthor !== m.role) {
      if (chunkBuffer.length > 0) {
        currentBlocks.push(textBlock(chunkBuffer));
        chunkBuffer = [];
      }
      lastAuthor = m.role;
      currentBlocks.push(promptTemplate(m.role));
    }
    chunkBuffer.push(m.content);
  }
  if (chunkBuffer.length > 0) currentBlocks.push(textBlock(chunkBuffer));

  return currentBlocks;
};

export class Chat extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: var(--my-element-text-color, #000);
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    h3.user {
      color: blue;
    }

    .chat {
      overflow: scroll;
      padding: 1rem;
    }

    form {
      margin-top: auto;
      display: flex;
      padding: 1rem;
      gap: 1rem;
    }

    button {
      background-color: pink;
      border: none;
      border-radius: 2px;
      min-width: 200px;
    }

    textarea {
      width: 100%;
      resize: none;
    }
  `;

  @property({ type: Array, state: true })
  accessor messages: Array<Message> = [];

  @property({ type: Boolean, state: true })
  accessor loading: Boolean = false;

  @property({ type: String })
  accessor model: string = "phi3.5";

  @property({ type: String })
  accessor endpoint: string = "http://localhost:11434/v1/";

  client: OpenAI;

  constructor() {
    super();

    this.client = new OpenAI({
      baseURL: this.endpoint,

      // required but ignored
      apiKey: "ollama",
      dangerouslyAllowBrowser: true,
    });
  }

  async __addUserMessage() {
    const textInputElement: HTMLTextAreaElement = <HTMLTextAreaElement>(
      this.renderRoot.querySelector("#user-input")
    );

    this.messages = [
      ...this.messages,
      {
        role: "user",
        content: textInputElement?.value || "",
        createdAt: Date.now(),
      },
    ];

    textInputElement.form?.reset();

    this.loading = true;

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages.slice(0).slice(-200),
      stream: true,
    });

    this.loading = false;

    for await (const event of stream) {
      for (const choice of event.choices) {
        this.messages = [
          ...this.messages,
          {
            role: "assistant",
            content: choice.delta.content || "",
            createdAt: event.created,
          },
        ];
      }
    }
  }

  protected updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("messages") || changedProperties.has("loading")) {
      const chatElement = this.renderRoot.querySelector(".chat");
      if (chatElement) {
        chatElement.scroll({
          top: chatElement.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }

  render() {
    return html`
      <div class="chat">
        ${makeBlocks(this.messages).map((b) => html`${b}`)}
        ${this.loading ? html`🤖 I am thinking...` : null}
      </div>
      <form
        @submit=${(e: SubmitEvent) => {
          e.preventDefault();
          this.__addUserMessage();
        }}
      >
        <textarea
          autofocus
          id="user-input"
          @keypress=${(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              this.__addUserMessage();
            }
          }}
          required
        ></textarea>
        <button>Submit</button>
      </form>
    `;
  }
}
