import express from "express";
import cors from "cors";
import { Db } from "./db.js";
// import chalk from 'chalk';
import { GameSession } from "./gameSession.js";
import expressWS from "express-ws";

const ROOM_EXPIRY_CHECK_MS = 1000 * 60 * 10; // 10 minutes
const ROOM_EXPIRY_TIMEOUT_MS = 1000 * 60 * 60 * 8; // 8 hours

var app = express();
var db = new Db();

expressWS(app);

const rooms = {};

app.use(cors());

setInterval(() => {
  console.info(
    `Checking ${Object.keys(rooms).length} room(s) for inactivity...`,
  );
  for (let room of Object.values(rooms)) {
    if (
      new Date().getTime() - room.lastUpdate.getTime() >=
      ROOM_EXPIRY_TIMEOUT_MS
    ) {
      console.info(`Closing room due to inactivity: ${room.id}.`);

      room.clients.forEach((client) => client.terminate());

      delete rooms[room.id];
    }
  }
}, ROOM_EXPIRY_CHECK_MS);

app.get("/", (req, res) => {
  res.json("This is Pokeclicker Super Sync.");
});

app.get("/session/new", (req, res) => {
  const newRoom = new GameSession();

  rooms[newRoom.id] = newRoom;

  res.json(newRoom);
});

app.get("/session/room/:room", (req, res) => {
  const data = rooms[req.params.room];

  res.json(data);
});

function sendMessage(ws, event, payload = {}) {
  ws?.send?.(JSON.stringify({ event, payload }));
}

function sendAlert(ws, message, title, options = {}) {
  sendMessage(ws, "alert", { message, title, ...options });
}

function sendError(ws, message, options = {}) {
  sendMessage(ws, "alert", { message, type: "danger", ...options }); // todo styling.
}

function usingRoom(ws, callback) {
  const room = Object.values(rooms).find(
    (room) => room.clients.find(({ socket }) => socket === ws) !== undefined,
  );

  if (room) {
    callback(room);
  } else {
    sendError(ws, "Game session does not exist.");
  }
}

app.ws("/", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      switch (data.event) {
        case "heartbeat":
          sendMessage(ws, "heartbeat-response");
          break;

        case "join": {
          const room = rooms[data.payload.code];

          if (room) {
            room.broadcastAlert(
              `${data.payload.username} has joined the super sync session.`,
              "Player joined",
            );

            room.addClient(ws, data.payload.username);

            const otherMembers = room.getSessionMembers(ws);
            const otherMembersMessage =
              otherMembers.length > 0
                ? `There are ${
                    otherMembers.length
                  } other player(s) in this room: ${otherMembers.join(", ")}.`
                : "You are the only player in this room.";

            sendAlert(
              ws,
              `Joined the super sync session (Sync code: ${data.payload.code}).\n\n${otherMembersMessage}`,
              "Session joined",
            );
            sendMessage(
              ws,
              "initialSync",
              Object.entries(room).reduce(
                (acc, [key, value]) =>
                  key === "clients" ? acc : { ...acc, [key]: value },
                {},
              ),
            );
          } else {
            sendError(ws, "Game session does not exist.");
          }

          break;
        }

        case "catch":
          usingRoom(ws, (room) => {
            room.addCatch(ws, data.payload.id, data.payload.shiny);
          });

          break;

        case "keyItem":
          usingRoom(ws, (room) => {
            room.addKeyItem(ws, data.payload.keyItem);
          });

          break;

        case "badge":
          usingRoom(ws, (room) => {
            room.addBadge(ws, data.payload.badge);
          });

          break;

        case "saveTick":
          usingRoom(ws, (room) => {
            room.addSaveData(ws, data.payload);
          });

          break;

        case "questLine":
          usingRoom(ws, (room) => {
            room.addQuestLine(
              ws,
              data.payload.questLineID,
              data.payload.questID,
            );
            console.log(
              `Completing quest ${data.payload.questID} for quest-line ${data.payload.questLineID}`,
            );
          });

          break;
        default:
          console.warn(`Unexpected event type on socket: ${data.event}.`);
      }
    } catch (e) {
      console.error(e);
    }
  });

  ws.on("close", () => {
    usingRoom(ws, (room) => {
      room.broadcastAlert(
        `${room.getUsername(ws)} has left the super sync session.`,
        "Player left",
      );

      room.removeClient(ws);
    });
  });

  // ws.send(`New connection established from ${ws.`);
});

const listener = app.listen(3000, () => {
  console.log(`Started server on ${listener.address().port}`);
  db.addRoom("Test");
});
