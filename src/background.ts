import OBR from "@owlbear-rodeo/sdk";

const REQUEST_CHANNEL = "rpg-calunia/test-request";

type TestRequest = {
  targetPlayerId: string;
  targetPlayerName: string;
  skillName: string;
  bonus: number;
  requesterName: string;
  timestamp: number;
};

async function start() {
  const playerId = await OBR.player.getId();
  const playerRole = await OBR.player.getRole();

  console.log("RPG Calúnia Background iniciado.");
  console.log("Meu playerId:", playerId);
  console.log("Minha função:", playerRole);

  OBR.broadcast.onMessage(REQUEST_CHANNEL, async (event) => {
    const request = event.data as TestRequest;

    console.log("Pedido recebido:", request);

    // Se o pedido não é para mim, simplesmente ignoro.
    if (request.targetPlayerId !== playerId) {
      return;
    }

    console.log(
      `TESTE SOLICITADO: ${request.skillName} +${request.bonus}`
    );

    // Coloca um aviso no ícone da extensão.
    OBR.action.setBadgeText("!");

    // Envia o pedido para a interface do jogador.
    await OBR.broadcast.sendMessage(
  "rpg-calunia/show-test-request",
  request,
  {
    destination: "LOCAL",
  }
);
  });
}

OBR.onReady(start);