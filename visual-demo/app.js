const steps = [
  {
    code: "I",
    label: "Identity",
    color: "#1e8a5d",
    log: "Agent resolved: openclaw-agent-001 -> did:luffa:user_001",
    status: "Identity OK",
  },
  {
    code: "M",
    label: "Permission",
    color: "#17839a",
    log: "Policy ALLOW: luffa.create_task, budget 2.5 <= 5",
    status: "Permission ALLOW",
  },
  {
    code: "X",
    label: "Execution",
    color: "#315ea8",
    log: "Handler executed: task created for community_001",
    status: "SUCCESS",
  },
  {
    code: "T",
    label: "Settlement",
    color: "#b7791f",
    log: "Atomic transfer completed: 2.5 LUFFA payer -> payee",
    status: "COMPLETED",
  },
  {
    code: "F",
    label: "Learning",
    color: "#b23a48",
    log: "Feedback score 5 submitted; EMA reputation updated",
    status: "Reputation 0.55",
  },
];

const finalMerkleRoot =
  "0x9f4c7a2e8b61d013a4f2c887b0debb2f2c1b67aa41f6e7c58123b8a90d5c3e11";

const playButton = document.querySelector("#playButton");
const recordButton = document.querySelector("#recordButton");
const resetButton = document.querySelector("#resetButton");
const token = document.querySelector("#token");
const flowSteps = [...document.querySelectorAll(".flow-step")];
const payerBalance = document.querySelector("#payerBalance");
const payeeBalance = document.querySelector("#payeeBalance");
const statusBadge = document.querySelector("#statusBadge");
const executionStatus = document.querySelector("#executionStatus");
const settlementStatus = document.querySelector("#settlementStatus");
const reputationScore = document.querySelector("#reputationScore");
const merkleRoot = document.querySelector("#merkleRoot");
const eventLog = document.querySelector("#eventLog");
const canvas = document.querySelector("#videoCanvas");
const ctx = canvas.getContext("2d");

let timers = [];
let activeStep = -1;

function clearTimers() {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers = [];
}

function setStep(index) {
  activeStep = index;
  flowSteps.forEach((step, stepIndex) => {
    step.classList.toggle("active", stepIndex === index);
  });

  const top = 64 + index * 110;
  token.style.top = `${top}px`;
  token.style.background = steps[index].color;
  token.textContent = steps[index].code;

  const current = steps[index];
  statusBadge.textContent = current.label.toUpperCase();
  eventLog.textContent += `[${current.code}] ${current.log}\n`;

  if (index >= 2) {
    executionStatus.textContent = "SUCCESS";
  }
  if (index >= 3) {
    settlementStatus.textContent = "COMPLETED";
    animateNumber(payerBalance, 25, 22.5, 620);
    animateNumber(payeeBalance, 0, 2.5, 620);
  }
  if (index >= 4) {
    reputationScore.textContent = "0.55";
    merkleRoot.textContent = finalMerkleRoot;
    statusBadge.textContent = "CLOSED LOOP";
  }
}

function animateNumber(element, from, to, duration) {
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = (from + (to - from) * eased).toFixed(1);
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function resetDemo() {
  clearTimers();
  activeStep = -1;
  flowSteps.forEach((step) => step.classList.remove("active"));
  token.style.top = "64px";
  token.style.background = "#1e8a5d";
  token.textContent = "AI";
  payerBalance.textContent = "25.0";
  payeeBalance.textContent = "0.0";
  statusBadge.textContent = "READY";
  executionStatus.textContent = "Pending";
  settlementStatus.textContent = "Pending";
  reputationScore.textContent = "0.50";
  merkleRoot.textContent = "waiting-for-execution";
  eventLog.textContent = "Luffa Fabric Basic V2 demo initialized.\n";
}

function playDemo() {
  resetDemo();
  steps.forEach((_, index) => {
    timers.push(window.setTimeout(() => setStep(index), 650 + index * 1200));
  });
}

function drawCanvas(progress) {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f6fbf6");
  gradient.addColorStop(0.52, "#e8f0f4");
  gradient.addColorStop(1, "#f7f3e8");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#172026";
  ctx.font = "800 58px Inter, Arial";
  ctx.fillText("Luffa Fabric MVP 1 Basic V2", 64, 92);
  ctx.font = "500 26px Inter, Arial";
  ctx.fillStyle = "#40505b";
  ctx.fillText("Identity -> Permission -> Execution -> Settlement -> Learning", 66, 136);

  const currentIndex = Math.min(Math.floor(progress * steps.length), steps.length - 1);
  const localProgress = progress * steps.length - currentIndex;
  const startX = 124;
  const gap = 236;
  const y = 328;

  ctx.lineWidth = 8;
  ctx.strokeStyle = "#c9d8dd";
  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.lineTo(startX + gap * 4, y);
  ctx.stroke();

  ctx.strokeStyle = "#1e8a5d";
  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.lineTo(startX + gap * (currentIndex + Math.max(localProgress, 0)), y);
  ctx.stroke();

  steps.forEach((step, index) => {
    const x = startX + gap * index;
    const reached = progress * steps.length >= index;
    ctx.fillStyle = reached ? step.color : "#ffffff";
    ctx.strokeStyle = reached ? step.color : "#b6c5cb";
    ctx.lineWidth = 4;
    roundedRect(ctx, x - 58, y - 58, 116, 116, 18, true, true);

    ctx.fillStyle = reached ? "#ffffff" : "#60707d";
    ctx.font = "900 42px Inter, Arial";
    ctx.textAlign = "center";
    ctx.fillText(step.code, x, y + 14);

    ctx.fillStyle = "#172026";
    ctx.font = "800 24px Inter, Arial";
    ctx.fillText(step.label, x, y + 104);
  });

  const tokenX = startX + gap * Math.min(progress * steps.length, 4);
  ctx.fillStyle = "#172026";
  ctx.beginPath();
  ctx.arc(tokenX, y - 120, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 20px Inter, Arial";
  ctx.fillText("AI", tokenX, y - 113);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, 64, 520, 1152, 116, 18, true, false, "#172026");
  ctx.fillStyle = "#d5f7e6";
  ctx.font = "700 24px Inter, Arial";
  const line = steps[currentIndex]?.log ?? "Demo initialized";
  ctx.fillText(`[${steps[currentIndex].code}] ${line}`, 94, 568);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 24px Inter, Arial";
  const payer = progress >= 0.68 ? "22.5" : "25.0";
  const payee = progress >= 0.68 ? "2.5" : "0.0";
  const rep = progress >= 0.88 ? "0.55" : "0.50";
  ctx.fillText(`Payer ${payer} LUFFA    Payee ${payee} LUFFA    Reputation ${rep}`, 94, 606);
}

function roundedRect(context, x, y, width, height, radius, fill, stroke, fillColor) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  if (fillColor) context.fillStyle = fillColor;
  if (fill) context.fill();
  if (stroke) context.stroke();
}

function animateCanvas(duration = 9000) {
  const start = performance.now();

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    drawCanvas(progress);
    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

async function recordVideoDemo() {
  if (!canvas.captureStream || !window.MediaRecorder) {
    alert("当前浏览器不支持 Canvas 录制，请直接使用可视化页面演示。");
    return;
  }

  recordButton.disabled = true;
  recordButton.textContent = "录制中...";
  const stream = canvas.captureStream(30);
  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lael-mvp-basic-v2-demo.webm";
    link.click();
    URL.revokeObjectURL(url);
    recordButton.disabled = false;
    recordButton.textContent = "录制 WebM Demo";
  };

  recorder.start();
  animateCanvas(9000);
  playDemo();
  window.setTimeout(() => recorder.stop(), 9400);
}

playButton.addEventListener("click", playDemo);
resetButton.addEventListener("click", resetDemo);
recordButton.addEventListener("click", recordVideoDemo);

resetDemo();
drawCanvas(0);
