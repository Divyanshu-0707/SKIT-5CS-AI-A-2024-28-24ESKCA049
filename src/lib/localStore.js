import { createStarterData, makeId } from "./demoData.js";

const STORAGE_KEY = "decision-board-local-v1";
const CHANGE_EVENT = "decision-board-local-change";
const WORKSPACE_MODES = ["whiteboard", "mindmap", "both"];

function readData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const starter = createStarterData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(starter));
    return starter;
  }

  try {
    return JSON.parse(saved);
  } catch {
    const starter = createStarterData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(starter));
    return starter;
  }
}

function writeData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function subscribe(read, callback) {
  const publish = () => callback(read());
  publish();
  window.addEventListener(CHANGE_EVENT, publish);
  window.addEventListener("storage", publish);

  return () => {
    window.removeEventListener(CHANGE_EVENT, publish);
    window.removeEventListener("storage", publish);
  };
}

function objectValues(value) {
  return Object.values(value || {});
}

export const localStore = {
  watchBoards(userId, callback) {
    return subscribe(() => {
      const data = readData();
      return objectValues(data.boards)
        .filter(
          (board) =>
            board.ownerId === userId ||
            board.memberIds?.includes(userId),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }, callback);
  },

  async createBoard(user, title, workspaceMode = "both") {
    const data = readData();
    const id = makeId("board");
    const now = Date.now();
    data.boards[id] = {
      id,
      title: title.trim() || "Untitled decision",
      ownerId: user.uid,
      ownerName: user.displayName,
      accessMode: "link",
      collaborationMode: "shared-edit",
      workspaceMode: WORKSPACE_MODES.includes(workspaceMode)
        ? workspaceMode
        : "both",
      memberIds: [user.uid],
      memberCount: 1,
      locked: false,
      canvasWidth: 1600,
      canvasHeight: 980,
      createdAt: now,
      updatedAt: now,
    };
    data.members[id] = {
      [user.uid]: {
        userId: user.uid,
        displayName: user.displayName,
        role: "owner",
        isAnonymous: user.isAnonymous,
        joinedAt: now,
      },
    };
    data.cards[id] = {};
    data.cardEdges ||= {};
    data.cardEdges[id] = {};
    data.mindMaps[id] = {
      id: "main",
      title: "Decision map",
      revision: 1,
      nodes: {},
      edges: {},
    };
    writeData(data);
    return id;
  },

  watchBoard(boardId, callback, onError) {
    return subscribe(() => {
      const board = readData().boards[boardId];
      if (!board) {
        onError?.(new Error("This board does not exist."));
        return null;
      }
      return board;
    }, callback);
  },

  async joinBoard(boardId, user) {
    const data = readData();
    const board = data.boards[boardId];
    if (!board) throw new Error("This board does not exist.");
    if (
      data.members[boardId]?.[user.uid] &&
      (!user.isAnonymous || board.ownerId === user.uid)
    ) {
      return;
    }
    if (user.isAnonymous && board.ownerId !== user.uid) {
      throw new Error("Sign in with Google or email to open a shared board.");
    }
    if (board.accessMode !== "link" && board.ownerId !== user.uid) {
      throw new Error("This board is private.");
    }

    data.members[boardId] ||= {};
    if (!data.members[boardId][user.uid]) {
      data.members[boardId][user.uid] = {
        userId: user.uid,
        displayName: user.displayName,
        role: board.ownerId === user.uid ? "owner" : "editor",
        isAnonymous: user.isAnonymous,
        joinedAt: Date.now(),
      };
      board.memberIds = [...new Set([...(board.memberIds || []), user.uid])];
      board.memberCount = board.memberIds.length;
      board.updatedAt = Date.now();
      writeData(data);
    }
  },

  async updateBoard(boardId, patch, userId) {
    const data = readData();
    const board = data.boards[boardId];
    if (!board) throw new Error("This board does not exist.");
    if (
      "workspaceMode" in patch &&
      !WORKSPACE_MODES.includes(patch.workspaceMode)
    ) {
      throw new Error("Choose Whiteboard, Mind Map, or Both.");
    }
    if (
      (
        "locked" in patch ||
        "title" in patch ||
        "accessMode" in patch ||
        "collaborationMode" in patch ||
        "workspaceMode" in patch
      ) &&
      board.ownerId !== userId
    ) {
      throw new Error("Only the board owner can change this setting.");
    }
    data.boards[boardId] = {
      ...board,
      ...patch,
      updatedAt: Date.now(),
    };
    writeData(data);
  },

  async deleteBoard(boardId) {
    const data = readData();
    const cardIds = Object.keys(data.cards[boardId] || {});
    cardIds.forEach((cardId) => {
      delete data.comments[cardId];
      delete data.votes[cardId];
    });
    delete data.boards[boardId];
    delete data.members[boardId];
    delete data.cards[boardId];
    delete data.cardEdges?.[boardId];
    delete data.mindMaps[boardId];
    writeData(data);
  },

  watchCards(boardId, callback) {
    return subscribe(() => {
      const data = readData();
      return objectValues(data.cards[boardId]).sort(
        (a, b) => a.createdAt - b.createdAt,
      );
    }, callback);
  },

  async createCard(boardId, card) {
    const data = readData();
    data.cards[boardId] ||= {};
    const now = Date.now();
    data.cards[boardId][card.id] = {
      voteCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
      ...card,
      boardId,
    };
    data.boards[boardId].updatedAt = now;
    writeData(data);
    return card.id;
  },

  async updateCard(boardId, cardId, patch) {
    const data = readData();
    const card = data.cards[boardId]?.[cardId];
    if (!card) throw new Error("This card no longer exists.");
    data.cards[boardId][cardId] = {
      ...card,
      ...patch,
      updatedAt: Date.now(),
    };
    data.boards[boardId].updatedAt = Date.now();
    writeData(data);
  },

  async deleteCard(boardId, cardId) {
    const data = readData();
    delete data.cards[boardId]?.[cardId];
    Object.values(data.cardEdges?.[boardId] || {}).forEach((edge) => {
      if (edge.from === cardId || edge.to === cardId) {
        delete data.cardEdges[boardId][edge.id];
      }
    });
    delete data.comments[cardId];
    delete data.votes[cardId];
    data.boards[boardId].updatedAt = Date.now();
    writeData(data);
  },

  watchCardEdges(boardId, callback) {
    return subscribe(() => {
      const data = readData();
      return data.cardEdges?.[boardId] || {};
    }, callback);
  },

  async saveCardEdge(boardId, edge) {
    const data = readData();
    data.cardEdges ||= {};
    data.cardEdges[boardId] ||= {};
    data.cardEdges[boardId][edge.id] = {
      ...data.cardEdges[boardId][edge.id],
      ...edge,
      updatedAt: Date.now(),
    };
    data.boards[boardId].updatedAt = Date.now();
    writeData(data);
  },

  async deleteCardEdge(boardId, edgeId) {
    const data = readData();
    delete data.cardEdges?.[boardId]?.[edgeId];
    data.boards[boardId].updatedAt = Date.now();
    writeData(data);
  },

  watchComments(cardId, callback) {
    return subscribe(() => {
      const data = readData();
      return objectValues(data.comments[cardId]).sort(
        (a, b) => a.createdAt - b.createdAt,
      );
    }, callback);
  },

  async addComment(boardId, cardId, user, text) {
    const data = readData();
    data.comments[cardId] ||= {};
    const id = makeId("comment");
    data.comments[cardId][id] = {
      id,
      authorId: user.uid,
      authorName: user.displayName,
      text: text.trim(),
      createdAt: Date.now(),
    };
    const card = data.cards[boardId][cardId];
    card.commentCount = objectValues(data.comments[cardId]).length;
    card.updatedAt = Date.now();
    writeData(data);
  },

  watchVote(cardId, userId, callback) {
    return subscribe(() => {
      const votes = readData().votes[cardId] || {};
      return {
        count: Object.keys(votes).length,
        voted: Boolean(votes[userId]),
      };
    }, callback);
  },

  async toggleVote(boardId, cardId, userId) {
    const data = readData();
    data.votes[cardId] ||= {};
    if (data.votes[cardId][userId]) delete data.votes[cardId][userId];
    else data.votes[cardId][userId] = true;
    data.cards[boardId][cardId].voteCount = Object.keys(
      data.votes[cardId],
    ).length;
    data.cards[boardId][cardId].updatedAt = Date.now();
    writeData(data);
  },

  watchMindMap(boardId, callback) {
    return subscribe(() => {
      const data = readData();
      return (
        data.mindMaps[boardId] || {
          id: "main",
          title: "Decision map",
          revision: 1,
          nodes: {},
          edges: {},
        }
      );
    }, callback);
  },

  async saveMindNode(boardId, node) {
    const data = readData();
    data.mindMaps[boardId] ||= {
      id: "main",
      title: "Decision map",
      revision: 1,
      nodes: {},
      edges: {},
    };
    data.mindMaps[boardId].nodes[node.id] = node;
    data.mindMaps[boardId].revision += 1;
    writeData(data);
  },

  async saveMindEdge(boardId, edge) {
    const data = readData();
    data.mindMaps[boardId].edges[edge.id] = edge;
    data.mindMaps[boardId].revision += 1;
    writeData(data);
  },

  async deleteMindNode(boardId, nodeId) {
    const data = readData();
    const map = data.mindMaps[boardId];
    delete map.nodes[nodeId];
    Object.values(map.edges).forEach((edge) => {
      if (edge.from === nodeId || edge.to === nodeId) delete map.edges[edge.id];
    });
    map.revision += 1;
    writeData(data);
  },

  async deleteMindEdge(boardId, edgeId) {
    const data = readData();
    delete data.mindMaps[boardId].edges[edgeId];
    data.mindMaps[boardId].revision += 1;
    writeData(data);
  },
};
