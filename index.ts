#!/usr/bin/env node

import enquirer from "enquirer";
import ora from "ora";

import { ChatGPTClient } from "./client.js";
import { ensureSessionToken } from "./config.js";

const myOwnAdvanture = "[ I want to create my own adventure ]";

const topics = [
  myOwnAdvanture,
  "The Quest for the Holy Grail",
  "The Case of the Missing Heirloom",
  "Escape from the Haunted Mansion",
  "Rise and Fall of the Roman Empire",
  "Love in the Time of Cholera",
  "The Hunger Games",
  "After the Bomb",
  "The Adventures of Superhero Joe",
  "A Fistful of Dollars",
  "Pirates of the Caribbean",
  "The Clockwork City",
  "Alone in the Wilderness",
  "The Maltese Falcon",
  "Startups in Germany",
  "Rise of AI",
];

async function run() {

  const api = new ChatGPTClient({
    sessionToken: await ensureSessionToken(),
  });

  await api.ensureAuth();

  let topic = (
    await enquirer.prompt<{ message: string }>({
      type: "select",
      name: "message",
      message: "Choose your adventure",
      choices: topics,
    })
  ).message;

  if (topic === myOwnAdvanture) {
    topic = (
      await enquirer.prompt<{ topic: string }>({
        type: "input",
        name: "topic",
        message: "What is your adventure?",
      })
    ).topic;
  }

  const introMessage = `Create a textadventure. Topic: ${topic}. Always end your response with "your choices" and output a list with options 
  what can be done next, unless the game is over. Provide no "other" option. 
  Stop after the choices and wait for me to chose (No Explanation)`;

  let introSent = false;
  let answer: { message?: string } = {};
  let choices = [];

  while (true) {
    choices = await getMessages(
      api,
      !introSent ? introMessage : answer.message
    );

    try {
      answer = await enquirer.prompt<{ message: string }>({
        type: "select",
        name: "message",
        message: "Take your choice",
        choices,
      });
      introSent = true;
    } catch (e) {
      console.log("Aborted.");
      console.log(e);
      process.exit(1);
    }
  }
}

async function getMessages(
  api: ChatGPTClient,
  request: string
): Promise<string[]> {
  try {
    const response = await api.getAnswer(request);

    const messages = response
      .split("\n")
      .filter((line) => line.match(/^(\d+\.|-|\*)\s+/))
      .map(normalizeMessage);

    return messages;
  } catch (e) {
    throw e;
  }
}

function normalizeMessage(line: string) {
  return line
    .replace(/^(\d+\.|-|\*)\s+/, "")
    .replace(/^[`"']/, "")
    .replace(/[`"']$/, "")
    .replace(/[`"']:/, ":") // sometimes it formats messages like this: `feat`: message
    .replace(/:[`"']/, ":") // sometimes it formats messages like this: `feat:` message
    .replace(/\\n/g, "");
}

run();
