import io = require('socket.io');
import uuid = require('uuid/v4');
import { Card, shuffleCard } from './card';

const enum GameStatus {
    Ready,
    DealMissPending,
    Commitment,
    PresidentReady,
    MainGame,
}

const enum Role {
    President,
    Friend,
    Opposition,
    None,
}

class PlayerStatus {
    cards: Card[] = [];
    role: Role = Role.None;
    playedCard: string = '';
    ready: boolean = false

    constructor() {

    }
}

// 5ma
class RoomData {
    id: string;
    playerList: string[] = [];
    gameStatus: GameStatus = GameStatus.Ready;
    playerStatus: { [playerId: string]: PlayerStatus } = {};

    constructor(roomId: string, roomCreator: UserData) {
        this.id = roomId;
        this.join(roomCreator);
    }

    reset() {
        this.gameStatus = GameStatus.Ready;
        this.playerList.forEach(userId => {
            let ps: PlayerStatus = this.playerStatus[userId];
            ps.cards = [];
            ps.playedCard = '';
            ps.ready = false;
            ps.role = Role.None;
        });
        // emit reset event to room
        server.in(this.id).emit('reset', null);
    }

    join(user: UserData): boolean {
        if (user.isJoined()) {
            return false;
        }
        if (this.playerList.length >= 5) {
            return false;
        }
        this.playerList.push(user.id);
        this.playerStatus[user.id] = new PlayerStatus();
        user.roomId = this.id;
        return true;
    }

    leave(user: UserData): boolean {
        const idx = this.playerList.indexOf(user.id);
        if (idx === -1) {
            return false;
        }
        if (this.gameStatus !== 0) {
            return false;
        }
        this.playerList.splice(idx, 1);
        delete this.playerStatus[user.id];
        return true;
    }

    forcedLeave(user: UserData) {
        // for now
        this.leave(user);
        this.reset();
    }

    isAllReady(): boolean {
        let readyCount = 0;
        this.playerList.forEach(userId => {
            readyCount += +this.playerStatus[userId].ready;
        });
        return readyCount === 5;
    }
}

class UserData {
    id: string;
    roomId: string;
    nickname: string;
    constructor(userId: string) {
        this.id = userId;
        this.roomId = '';
        this.nickname = '';
    }

    isJoined(): boolean {
        return this.roomId !== '';
    }
}

// construct server instance
const server = io(12345);

let roomData: { [roomId: string]: RoomData } = {};

let userData: { [userId: string]: UserData } = {};

// socket connected
server.on('connect', socket => {
    userData[socket.id] = new UserData(socket.id);

    socket.on('disconnect', reason => {
        const user = userData[socket.id];
        if (user.isJoined()) {
            roomData[user.roomId].forcedLeave(user);
        }
        delete userData[socket.id];
    });

    socket.on('set-nickname', (data, reply) => {
        const user = userData[socket.id];
        if (data) {
            user.nickname = data;
            reply(true);
        }
        else {
            reply(false);
        }
    });

    socket.on('room-list', (data, reply) => {
        reply(Object.keys(roomData));
    });

    socket.on('create-room', (data, reply) => {
        const userId = socket.id;
        const user = userData[userId];
        if (user.isJoined()) {
            reply(null);
            return;
        }
        // generate random string
        const roomId = uuid();
        const room = new RoomData(roomId, user);
        roomData[roomId] = room;
        reply(roomId);
    });

    socket.on('join-room', (data, reply) => {
        // data: room id
        const userId = socket.id;
        const user = userData[userId];
        if (user.isJoined()) {
            reply(null);
            return;
        }
        if (!(data in roomData)) {
            reply(null);
            return;
        }
        if (!roomData[data].join(user)) {
            reply(null);
            return;
        }
        reply(data);
    });

    socket.on('ready', (data, reply) => {
        // data is none
        const user = userData[socket.id];
        const room = roomData[user.roomId];

        if (room.gameStatus !== GameStatus.Ready) {
            reply(false);
            return;
        }

        room.playerStatus[user.id].ready = true;
        if (room.isAllReady()) {
            readyGame(room);
            room.playerList.forEach(userId => {
                const cards = room.playerStatus[userId].cards.map(x => x.toString());
                server.to(userId).emit('deal', cards);
            });
        }
        reply(true);
    });

    socket.on('ready-cancel', (data, reply) => {
        const user = userData[socket.id];
        const room = roomData[user.roomId];

        if (room.gameStatus !== GameStatus.Ready) {
            reply(false);
            return;
        }

        room.playerStatus[user.id].ready = false;
        reply(true);
    });
});

function readyGame(room: RoomData) {
    const card: Card[][] = shuffleCard();
    room.playerList.forEach((userId, i) => {
        room.playerStatus[userId].cards = card[i];
    });
    room.gameStatus = GameStatus.DealMissPending;
}
