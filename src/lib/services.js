import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db, firebaseMode } from "./firebase.js";
import { localStore } from "./localStore.js";
import { makeDemoUser } from "./demoData.js";
import {
  normalizeArrowType,
  normalizeEdgeShape,
  normalizeNodeShape,
} from "./mindMapGeometry.js";

const WORKSPACE_MODES = ["whiteboard", "mindmap", "both"];
const DELETE_BATCH_SIZE = 400;
const GEMINI_PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL?.trim() || "";
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

async function deleteReferences(references) {
  for (let index = 0; index < references.length; index += DELETE_BATCH_SIZE) {
    const batch = writeBatch(db);
    references
      .slice(index, index + DELETE_BATCH_SIZE)
      .forEach((reference) => batch.delete(reference));
    await batch.commit();
  }
}

function readableError(error, fallback = "Something went wrong.") {
  const code = error?.code || "";
  const messages = {
    "auth/email-already-in-use": "An account already uses this email.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/popup-blocked":
      "The Google sign-in window was blocked. Allow popups and try again.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/unauthorized-domain":
      "Google sign-in is not authorized for this domain yet.",
    "auth/operation-not-allowed":
      "This sign-in method is not enabled in Firebase yet.",
    "auth/account-exists-with-different-credential":
      "An account already uses this email with another sign-in method.",
    "auth/credential-already-in-use":
      "That Google account is already connected to another Decision Board account. Sign out, then sign in with Google.",
    "auth/weak-password": "Use a password with at least six characters.",
    "permission-denied": "You do not have permission to do that.",
    unavailable: "The service is temporarily unavailable. Try again.",
  };
  return new Error(messages[code] || error?.message || fallback);
}

function timestampValue(value) {
  if (value?.toMillis) return value.toMillis();
  return value ?? null;
}

function normaliseDocument(snapshot) {
  const value = snapshot.data();
  return {
    id: snapshot.id,
    ...value,
    createdAt: timestampValue(value.createdAt),
    updatedAt: timestampValue(value.updatedAt),
  };
}

function normaliseAuthUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName:
      user.displayName ||
      (user.isAnonymous ? `Guest ${user.uid.slice(0, 5)}` : user.email),
    email: user.email || "",
    isAnonymous: user.isAnonymous,
  };
}

export function watchAuth(callback, onError) {
  if (firebaseMode === "configuration-error") {
    callback(null);
    return () => {};
  }

  if (firebaseMode === "demo") {
    callback(makeDemoUser());
    return () => {};
  }

  return onAuthStateChanged(
    auth,
    (user) => callback(normaliseAuthUser(user)),
    (error) => onError?.(readableError(error, "Authentication could not start.")),
  );
}

export async function registerUser(displayName, email, password) {
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    await updateProfile(credential.user, {
      displayName: displayName.trim() || "Decision Board user",
    });
    return normaliseAuthUser(credential.user);
  } catch (error) {
    throw readableError(error, "The account could not be created.");
  }
}

export async function loginUser(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return normaliseAuthUser(credential.user);
  } catch (error) {
    throw readableError(error, "Sign in failed.");
  }
}

export async function loginWithGoogle() {
  if (firebaseMode === "demo") return makeDemoUser();
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    return normaliseAuthUser(credential.user);
  } catch (error) {
    throw readableError(error, "Google sign-in failed.");
  }
}

export async function upgradeGuestWithGoogle() {
  if (firebaseMode === "demo") return makeDemoUser();
  try {
    if (!auth.currentUser?.isAnonymous) return loginWithGoogle();
    const credential = await linkWithPopup(auth.currentUser, googleProvider);
    return normaliseAuthUser(credential.user);
  } catch (error) {
    throw readableError(error, "The guest account could not be linked to Google.");
  }
}

export async function continueAsGuest() {
  if (firebaseMode === "demo") return makeDemoUser();
  try {
    const credential = await signInAnonymously(auth);
    if (!credential.user.displayName) {
      await updateProfile(credential.user, {
        displayName: `Guest ${credential.user.uid.slice(0, 5)}`,
      });
    }
    return normaliseAuthUser(credential.user);
  } catch (error) {
    throw readableError(error, "Guest access is not enabled yet.");
  }
}

export async function logoutUser() {
  if (firebaseMode === "firebase") await signOut(auth);
}

export function watchBoards(user, callback, onError) {
  if (firebaseMode === "demo") {
    return localStore.watchBoards(user.uid, callback);
  }

  const boardQuery = user.isAnonymous
    ? query(collection(db, "boards"), where("ownerId", "==", user.uid))
    : query(
        collection(db, "boards"),
        where("memberIds", "array-contains", user.uid),
      );
  return onSnapshot(
    boardQuery,
    (snapshot) => {
      const boards = snapshot.docs
        .map(normaliseDocument)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      callback(boards);
    },
    (error) => onError?.(readableError(error, "Boards could not be loaded.")),
  );
}

export async function createBoard(user, title, workspaceMode = "both") {
  if (firebaseMode === "demo") {
    return localStore.createBoard(user, title, workspaceMode);
  }

  try {
    const safeWorkspaceMode = WORKSPACE_MODES.includes(workspaceMode)
      ? workspaceMode
      : "both";
    const boardRef = doc(collection(db, "boards"));
    const memberRef = doc(boardRef, "members", user.uid);
    const batch = writeBatch(db);
    batch.set(boardRef, {
      title: title.trim() || "Untitled decision",
      ownerId: user.uid,
      ownerName: user.displayName,
      accessMode: "link",
      collaborationMode: "shared-edit",
      workspaceMode: safeWorkspaceMode,
      memberIds: [user.uid],
      memberCount: 1,
      locked: false,
      deleting: false,
      canvasWidth: 1600,
      canvasHeight: 980,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(memberRef, {
      userId: user.uid,
      displayName: user.displayName,
      role: "owner",
      isAnonymous: user.isAnonymous,
      joinedAt: serverTimestamp(),
    });
    await batch.commit();
    return boardRef.id;
  } catch (error) {
    throw readableError(error, "The board could not be created.");
  }
}

export function watchBoard(boardId, callback, onError) {
  if (firebaseMode === "demo") {
    return localStore.watchBoard(boardId, callback, onError);
  }

  return onSnapshot(
    doc(db, "boards", boardId),
    (snapshot) => {
      callback(snapshot.exists() ? normaliseDocument(snapshot) : null);
    },
    (error) => onError?.(readableError(error, "This board is unavailable.")),
  );
}

export async function joinBoard(boardId, user) {
  if (firebaseMode === "demo") {
    return localStore.joinBoard(boardId, user);
  }

  try {
    const boardRef = doc(db, "boards", boardId);
    const memberRef = doc(boardRef, "members", user.uid);
    await runTransaction(db, async (transaction) => {
      const boardSnapshot = await transaction.get(boardRef);
      const memberSnapshot = await transaction.get(memberRef);

      if (!boardSnapshot.exists()) throw new Error("This board does not exist.");
      const board = boardSnapshot.data();
      if (
        memberSnapshot.exists() &&
        (!user.isAnonymous || board.ownerId === user.uid)
      ) {
        return;
      }
      if (user.isAnonymous && board.ownerId !== user.uid) {
        throw new Error(
          "Sign in with Google or email to open a shared board.",
        );
      }
      if (board.deleting === true) {
        throw new Error("This board is being deleted.");
      }
      if (board.accessMode !== "link" && board.ownerId !== user.uid) {
        throw new Error("This board is private.");
      }

      transaction.set(memberRef, {
        userId: user.uid,
        displayName: user.displayName,
        role: board.ownerId === user.uid ? "owner" : "editor",
        isAnonymous: user.isAnonymous,
        joinedAt: serverTimestamp(),
      });
      transaction.update(boardRef, {
        memberIds: arrayUnion(user.uid),
        memberCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    throw readableError(error, "The shared board could not be joined.");
  }
}

export async function updateBoard(boardId, patch, userId) {
  if (firebaseMode === "demo") {
    return localStore.updateBoard(boardId, patch, userId);
  }

  try {
    if (
      "workspaceMode" in patch &&
      !WORKSPACE_MODES.includes(patch.workspaceMode)
    ) {
      throw new Error("Choose Whiteboard, Mind Map, or Both.");
    }
    await updateDoc(doc(db, "boards", boardId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw readableError(error, "The board could not be updated.");
  }
}

export function watchCards(boardId, callback, onError) {
  if (firebaseMode === "demo") {
    return localStore.watchCards(boardId, callback);
  }

  return onSnapshot(
    collection(db, "boards", boardId, "cards"),
    (snapshot) => {
      const cards = snapshot.docs
        .map(normaliseDocument)
        .filter((card) => card.deleting !== true)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      callback(cards);
    },
    (error) => onError?.(readableError(error, "Cards could not be loaded.")),
  );
}

export async function createCard(boardId, card) {
  if (firebaseMode === "demo") {
    return localStore.createCard(boardId, card);
  }

  try {
    await setDoc(doc(db, "boards", boardId, "cards", card.id), {
      ...card,
      boardId,
      deleting: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return card.id;
  } catch (error) {
    throw readableError(error, "The card could not be added.");
  }
}

export async function updateCard(boardId, cardId, patch) {
  if (firebaseMode === "demo") {
    return localStore.updateCard(boardId, cardId, patch);
  }

  try {
    await updateDoc(doc(db, "boards", boardId, "cards", cardId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw readableError(error, "The card could not be updated.");
  }
}

export async function deleteCard(boardId, cardId) {
  if (firebaseMode === "demo") {
    return localStore.deleteCard(boardId, cardId);
  }

  try {
    const cardRef = doc(db, "boards", boardId, "cards", cardId);
    await updateDoc(cardRef, {
      deleting: true,
      updatedAt: serverTimestamp(),
    });
    const [comments, votes, cardEdges] = await Promise.all([
      getDocs(collection(cardRef, "comments")),
      getDocs(collection(cardRef, "votes")),
      getDocs(collection(db, "boards", boardId, "cardEdges")),
    ]);
    await deleteReferences([
      ...comments.docs.map((item) => item.ref),
      ...votes.docs.map((item) => item.ref),
    ]);
    const batch = writeBatch(db);
    cardEdges.docs
      .filter((edge) => {
        const data = edge.data();
        return data.from === cardId || data.to === cardId;
      })
      .forEach((edge) => batch.delete(edge.ref));
    batch.delete(cardRef);
    await batch.commit();
  } catch (error) {
    try {
      await updateDoc(doc(db, "boards", boardId, "cards", cardId), {
        deleting: false,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Preserve the original error when the card is already gone or access
      // was lost while cleanup was running.
    }
    throw readableError(error, "The card could not be deleted.");
  }
}

export function watchCardEdges(boardId, callback, onError) {
  if (firebaseMode === "demo") {
    return localStore.watchCardEdges(boardId, callback);
  }

  return onSnapshot(
    collection(db, "boards", boardId, "cardEdges"),
    (snapshot) => {
      callback(
        Object.fromEntries(
          snapshot.docs.map((item) => [item.id, normaliseDocument(item)]),
        ),
      );
    },
    (error) =>
      onError?.(
        readableError(error, "Sticky note connections could not load."),
      ),
  );
}

export async function saveCardEdge(boardId, edge, userId) {
  if (firebaseMode === "demo") {
    return localStore.saveCardEdge(boardId, edge);
  }

  const edgeRef = doc(db, "boards", boardId, "cardEdges", edge.id);
  const { createdAt, updatedAt, revision, ...editableEdge } = edge;
  const payload = {
    ...editableEdge,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
    revision: increment(1),
  };
  if (!createdAt) {
    payload.createdBy = userId;
    payload.createdAt = serverTimestamp();
  }

  try {
    await setDoc(edgeRef, payload, { merge: true });
  } catch (error) {
    throw readableError(error, "The sticky note connection could not be saved.");
  }
}

export async function deleteCardEdge(boardId, edgeId) {
  if (firebaseMode === "demo") {
    return localStore.deleteCardEdge(boardId, edgeId);
  }

  try {
    await deleteDoc(doc(db, "boards", boardId, "cardEdges", edgeId));
  } catch (error) {
    throw readableError(
      error,
      "The sticky note connection could not be deleted.",
    );
  }
}

export function watchComments(boardId, cardId, callback, onError) {
  if (firebaseMode === "demo") {
    return localStore.watchComments(cardId, callback);
  }

  return onSnapshot(
    collection(db, "boards", boardId, "cards", cardId, "comments"),
    (snapshot) => {
      const comments = snapshot.docs
        .map(normaliseDocument)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      callback(comments);
    },
    (error) => onError?.(readableError(error, "Comments could not be loaded.")),
  );
}

export async function addComment(boardId, cardId, user, text) {
  if (!text.trim()) return;
  if (firebaseMode === "demo") {
    return localStore.addComment(boardId, cardId, user, text);
  }

  try {
    const cardRef = doc(db, "boards", boardId, "cards", cardId);
    const commentRef = doc(collection(cardRef, "comments"));
    await setDoc(commentRef, {
      authorId: user.uid,
      authorName: user.displayName,
      text: text.trim().slice(0, 600),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw readableError(error, "The comment could not be added.");
  }
}

export function watchVote(boardId, cardId, userId, callback, onError) {
  if (firebaseMode === "demo") {
    return localStore.watchVote(cardId, userId, callback);
  }

  const votesRef = collection(
    db,
    "boards",
    boardId,
    "cards",
    cardId,
    "votes",
  );
  return onSnapshot(
    votesRef,
    (snapshot) => {
      callback({
        count: snapshot.size,
        voted: snapshot.docs.some((vote) => vote.id === userId),
      });
    },
    (error) => onError?.(readableError(error, "Votes could not be loaded.")),
  );
}

export async function toggleVote(boardId, cardId, userId) {
  if (firebaseMode === "demo") {
    return localStore.toggleVote(boardId, cardId, userId);
  }

  try {
    const voteRef = doc(
      db,
      "boards",
      boardId,
      "cards",
      cardId,
      "votes",
      userId,
    );
    await runTransaction(db, async (transaction) => {
      const voteSnapshot = await transaction.get(voteRef);
      if (voteSnapshot.exists()) {
        transaction.delete(voteRef);
      } else {
        transaction.set(voteRef, {
          userId,
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    throw readableError(error, "The vote could not be changed.");
  }
}

export function watchMindMap(boardId, callback, onError) {
  if (firebaseMode === "demo") {
    return localStore.watchMindMap(boardId, callback);
  }

  let nodes = {};
  let edges = {};
  let nodesReady = false;
  let edgesReady = false;
  const publish = () =>
    nodesReady &&
    edgesReady &&
    callback({
      id: "main",
      title: "Decision map",
      nodes,
      edges,
    });

  const nodesRef = collection(
    db,
    "boards",
    boardId,
    "mindMaps",
    "main",
    "nodes",
  );
  const edgesRef = collection(
    db,
    "boards",
    boardId,
    "mindMaps",
    "main",
    "edges",
  );

  const stopNodes = onSnapshot(
    nodesRef,
    (snapshot) => {
      nodes = Object.fromEntries(
        snapshot.docs
          .map((item) => [item.id, normaliseDocument(item)])
          .filter(([, node]) => node.deleting !== true),
      );
      nodesReady = true;
      publish();
    },
    (error) => onError?.(readableError(error, "Mind-map nodes could not load.")),
  );
  const stopEdges = onSnapshot(
    edgesRef,
    (snapshot) => {
      edges = Object.fromEntries(
        snapshot.docs.map((item) => [item.id, normaliseDocument(item)]),
      );
      edgesReady = true;
      publish();
    },
    (error) => onError?.(readableError(error, "Mind-map edges could not load.")),
  );

  return () => {
    stopNodes();
    stopEdges();
  };
}

export async function saveMindNode(boardId, node, userId) {
  if (firebaseMode === "demo") {
    return localStore.saveMindNode(boardId, node);
  }

  const nodeRef = doc(
    db,
    "boards",
    boardId,
    "mindMaps",
    "main",
    "nodes",
    node.id,
  );
  const {
    createdAt,
    updatedAt,
    revision,
    ...editableNode
  } = node;
  const payload = {
    ...editableNode,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
    revision: increment(1),
  };
  if (!createdAt) {
    payload.createdBy = userId;
    payload.createdAt = serverTimestamp();
    payload.deleting = false;
  }

  try {
    await setDoc(nodeRef, payload, { merge: true });
  } catch (error) {
    throw readableError(error, "The mind-map node could not be saved.");
  }
}

export async function saveMindEdge(boardId, edge, userId) {
  if (firebaseMode === "demo") {
    return localStore.saveMindEdge(boardId, edge);
  }

  const edgeRef = doc(
    db,
    "boards",
    boardId,
    "mindMaps",
    "main",
    "edges",
    edge.id,
  );
  const {
    createdAt,
    updatedAt,
    revision,
    ...editableEdge
  } = edge;
  const payload = {
    ...editableEdge,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
    revision: increment(1),
  };
  if (!createdAt) {
    payload.createdBy = userId;
    payload.createdAt = serverTimestamp();
  }

  try {
    await setDoc(edgeRef, payload, { merge: true });
  } catch (error) {
    throw readableError(error, "The mind-map connection could not be saved.");
  }
}

export async function deleteMindNode(boardId, nodeId, userId) {
  if (firebaseMode === "demo") {
    return localStore.deleteMindNode(boardId, nodeId);
  }

  const nodeRef = doc(
    db,
    "boards",
    boardId,
    "mindMaps",
    "main",
    "nodes",
    nodeId,
    );
  try {
    await updateDoc(nodeRef, {
      deleting: true,
      updatedBy: userId,
      updatedAt: serverTimestamp(),
      revision: increment(1),
    });
    const edgeSnapshots = await getDocs(
      collection(db, "boards", boardId, "mindMaps", "main", "edges"),
    );
    const edgeReferences = edgeSnapshots.docs
      .filter((edge) => {
        const data = edge.data();
        return data.from === nodeId || data.to === nodeId;
      })
      .map((edge) => edge.ref);
    const batch = writeBatch(db);
    edgeReferences.forEach((edgeRef) => batch.delete(edgeRef));
    batch.delete(nodeRef);
    await batch.commit();
  } catch (error) {
    try {
      await updateDoc(nodeRef, {
        deleting: false,
        updatedBy: userId,
        updatedAt: serverTimestamp(),
        revision: increment(1),
      });
    } catch {
      // Preserve the original error when the node is already gone.
    }
    throw readableError(error, "The mind-map node could not be deleted.");
  }
}

export async function deleteMindEdge(boardId, edgeId) {
  if (firebaseMode === "demo") {
    return localStore.deleteMindEdge(boardId, edgeId);
  }
  await deleteDoc(
    doc(
      db,
      "boards",
      boardId,
      "mindMaps",
      "main",
      "edges",
      edgeId,
    ),
  );
}

export async function deleteBoard(boardId) {
  if (firebaseMode === "demo") {
    return localStore.deleteBoard(boardId);
  }

  let wasLocked = false;
  try {
    const boardRef = doc(db, "boards", boardId);
    const boardSnapshot = await getDoc(boardRef);
    if (!boardSnapshot.exists()) return;
    wasLocked = boardSnapshot.data().locked === true;
    await updateDoc(boardRef, {
      locked: true,
      deleting: true,
      updatedAt: serverTimestamp(),
    });

    const [members, cards, cardEdges, nodes, edges] = await Promise.all([
      getDocs(collection(boardRef, "members")),
      getDocs(collection(boardRef, "cards")),
      getDocs(collection(boardRef, "cardEdges")),
      getDocs(collection(boardRef, "mindMaps", "main", "nodes")),
      getDocs(collection(boardRef, "mindMaps", "main", "edges")),
    ]);

    const contentReferences = [];
    for (const card of cards.docs) {
      const [comments, votes] = await Promise.all([
        getDocs(collection(card.ref, "comments")),
        getDocs(collection(card.ref, "votes")),
      ]);
      contentReferences.push(
        ...comments.docs.map((item) => item.ref),
        ...votes.docs.map((item) => item.ref),
        card.ref,
      );
    }
    contentReferences.push(
      ...nodes.docs.map((item) => item.ref),
      ...edges.docs.map((item) => item.ref),
      ...cardEdges.docs.map((item) => item.ref),
      ...members.docs.map((item) => item.ref),
    );

    await deleteReferences(contentReferences);
    await deleteDoc(boardRef);
  } catch (error) {
    try {
      await updateDoc(doc(db, "boards", boardId), {
        locked: wasLocked,
        deleting: false,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Keep the original cleanup error if the board is already gone.
    }
    throw readableError(error, "The board could not be deleted.");
  }
}

function fallbackIdeaPlan(prompt, workspaceMode) {
  const topic = prompt.trim().slice(0, 70) || "this decision";
  const notes = [
    {
      id: "goal-note",
      nodeId: "goal",
      text: `Outcome and scope: Turn “${topic}” into a specific result with a clear deadline and measurable success condition. Record what is deliberately outside scope so the team does not solve a different problem.`,
    },
    {
      id: "people-note",
      nodeId: "people",
      text:
        "Stakeholders and evidence: Identify who decides, who executes, and who is affected. Ask each group for one concrete need or constraint, and name the evidence that would confirm it.",
    },
    {
      id: "plan-note",
      nodeId: "plan",
      text:
        "Execution plan: Break the preferred direction into the next three actions, assign one owner to each, and attach a realistic due date. Start with the smallest test that can produce useful evidence.",
    },
    {
      id: "risk-note",
      nodeId: "risk",
      text:
        "Main risk and mitigation: State the most likely failure mode, its early warning signal, and the action that reduces its probability or impact. Name who will monitor that signal.",
    },
    {
      id: "decision-note",
      nodeId: "decision",
      text:
        "Decision gate: Compare the evidence against the agreed success condition, record the chosen direction and why alternatives were rejected, then schedule the next review point.",
    },
  ];
  const nodes = [
    {
      id: "goal",
      text: topic,
      shape: "pill",
      noteId: "goal-note",
    },
    {
      id: "people",
      text: "Stakeholders and evidence",
      shape: "ellipse",
      noteId: "people-note",
    },
    {
      id: "plan",
      text: "Three-step execution plan",
      shape: "rounded",
      noteId: "plan-note",
    },
    {
      id: "risk",
      text: "Main risk and mitigation",
      shape: "rect",
      noteId: "risk-note",
    },
    {
      id: "decision",
      text: "Evidence-based decision gate",
      shape: "diamond",
      noteId: "decision-note",
    },
  ];
  const edges = [
    { from: "goal", to: "people", shape: "elbow", arrowType: "arrow" },
    { from: "goal", to: "plan", shape: "elbow", arrowType: "arrow" },
    { from: "goal", to: "risk", shape: "elbow", arrowType: "arrow" },
    { from: "people", to: "decision", shape: "straight", arrowType: "arrow" },
    { from: "plan", to: "decision", shape: "straight", arrowType: "arrow" },
    { from: "risk", to: "decision", shape: "straight", arrowType: "arrow" },
  ];
  return {
    summary:
      "A detailed starter structure links each mind-map topic to its supporting sticky note.",
    notes: workspaceMode === "mindmap" ? [] : notes,
    nodes: workspaceMode === "whiteboard" ? [] : nodes,
    edges: workspaceMode === "whiteboard" ? [] : edges,
  };
}

function inferNodeShape(text, index) {
  const words = String(text || "").toLowerCase();
  if (index === 0 || /\b(goal|topic|theme|purpose|outcome)\b/.test(words)) {
    return "pill";
  }
  if (/\b(decide|decision|choose|choice|question|approve|reject)\b/.test(words)) {
    return "diamond";
  }
  if (/\b(group|category|people|audience|stakeholder|area|phase)\b/.test(words)) {
    return "ellipse";
  }
  if (/\b(fact|note|detail|evidence|constraint|context)\b/.test(words)) {
    return "rect";
  }
  return "rounded";
}

function normaliseIdeaPlan(value, workspaceMode) {
  const rawNotes = Array.isArray(value?.notes) ? value.notes : [];
  const rawNodes = Array.isArray(value?.nodes) ? value.nodes : [];
  const rawEdges = Array.isArray(value?.edges) ? value.edges : [];
  const usedNoteIds = new Set();
  const notes = rawNotes
    .map((item, index) => {
      let id = String(item?.id || `note-${index + 1}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
      if (!id) id = `note-${index + 1}`;
      if (usedNoteIds.has(id)) id = `${id}-${index + 1}`.slice(0, 40);
      usedNoteIds.add(id);
      return {
        id,
        nodeId: String(item?.nodeId || "").trim().slice(0, 40),
      text: String(typeof item === "string" ? item : item?.text || "")
        .trim()
        .slice(0, 600),
      };
    })
    .filter((item) => item.text)
    .slice(0, 6);
  const usedNodeIds = new Set();
  const nodes = rawNodes
    .map((item, index) => {
      let id = String(item?.id || `node-${index + 1}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
      if (!id) id = `node-${index + 1}`;
      if (usedNodeIds.has(id)) id = `${id}-${index + 1}`.slice(0, 40);
      usedNodeIds.add(id);
      return {
        id,
        text: String(item?.text || "")
        .trim()
        .slice(0, 90),
        shape: normalizeNodeShape(
          item?.shape || inferNodeShape(item?.text, index),
        ),
        noteId: String(item?.noteId || "").trim().slice(0, 40),
      };
    })
    .filter((item) => item.id && item.text)
    .slice(0, 8);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const noteIds = new Set(notes.map((note) => note.id));

  notes.forEach((note) => {
    if (!nodeIds.has(note.nodeId)) note.nodeId = "";
  });
  nodes.forEach((node) => {
    if (!noteIds.has(node.noteId)) node.noteId = "";
  });
  notes.forEach((note) => {
    if (!note.nodeId) return;
    const node = nodes.find((item) => item.id === note.nodeId);
    if (node && !node.noteId) node.noteId = note.id;
  });
  nodes.forEach((node) => {
    if (!node.noteId) return;
    const note = notes.find((item) => item.id === node.noteId);
    if (note && !note.nodeId) note.nodeId = node.id;
  });

  const edges = rawEdges
    .map((item) => ({
      from: String(item?.from || "").trim().slice(0, 40),
      to: String(item?.to || "").trim().slice(0, 40),
      shape: normalizeEdgeShape(item?.shape),
      arrowType: normalizeArrowType(item?.arrowType || "arrow"),
    }))
    .filter(
      (edge) =>
        edge.from !== edge.to &&
        nodeIds.has(edge.from) &&
        nodeIds.has(edge.to),
    )
    .slice(0, 10);
  return {
    summary: String(value?.summary || "Gemini prepared a board plan.")
      .trim()
      .slice(0, 240),
    notes: workspaceMode === "mindmap" ? [] : notes,
    nodes: workspaceMode === "whiteboard" ? [] : nodes,
    edges: workspaceMode === "whiteboard" ? [] : edges,
  };
}

export async function requestIdeaDrafts(boardId, prompt, workspaceMode) {
  const safeMode = WORKSPACE_MODES.includes(workspaceMode)
    ? workspaceMode
    : "both";
  const safePrompt = prompt.trim().slice(0, 1200);
  if (safePrompt.length < 8) {
    throw new Error("Describe what you want Gemini to add to the board.");
  }
  const fallbackPlan = fallbackIdeaPlan(safePrompt, safeMode);

  if (firebaseMode === "demo") {
    return { plan: fallbackPlan, source: "demo" };
  }
  if (!GEMINI_PROXY_URL) {
    return {
      plan: fallbackPlan,
      source: "disabled",
      message: "The Gemini proxy is not connected yet.",
    };
  }
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    throw new Error("Sign in with Google or email to use Gemini.");
  }

  try {
    const boardSnapshot = await getDoc(doc(db, "boards", boardId));
    if (!boardSnapshot.exists()) throw new Error("This board no longer exists.");
    const board = boardSnapshot.data();
    const [cardsSnapshot, nodesSnapshot] = await Promise.all([
      getDocs(collection(db, "boards", boardId, "cards")),
      getDocs(
        collection(db, "boards", boardId, "mindMaps", "main", "nodes"),
      ),
    ]);
    const existingIdeas = [...cardsSnapshot.docs, ...nodesSnapshot.docs]
      .map((item) => String(item.data().text || "").trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, 16);
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch(GEMINI_PROXY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: safePrompt,
        workspaceMode: safeMode,
        boardTitle: String(board.title || "Untitled decision").slice(0, 80),
        existingIdeas,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload.error?.message ||
          payload.error ||
          "Gemini could not prepare this board.",
      );
    }
    const plan = normaliseIdeaPlan(payload.plan, safeMode);
    if (plan.notes.length === 0 && plan.nodes.length === 0) {
      throw new Error("Gemini returned an empty plan.");
    }
    return { plan, source: "gemini" };
  } catch (error) {
    const readable = readableError(
      error,
      "Gemini is unavailable. A built-in starter plan is shown instead.",
    );
    return {
      plan: fallbackPlan,
      source: "fallback",
      message: readable.message,
    };
  }
}
