import Howler from 'howler';
const EventEmitter = require('events');

class SoundsBase {
  constructor() {
    // events emitter
    this.events = new EventEmitter();

    this._soundsList = {
      win1: new Howler.Howl({
        src: ['sounds/win-1.flac'],
        volume: 1,
        html5: true,
        preload: true
      }),
      win2: new Howler.Howl({
        src: ['sounds/win-2.wav'],
        volume: 1,
        html5: true,
        preload: true
      }),
      win3: new Howler.Howl({
        src: ['sounds/win-3.wav'],
        volume: 1,
        html5: true,
        preload: true
      }),
      win4: new Howler.Howl({
        src: ['sounds/win-4.mp3'],
        volume: 1,
        html5: true,
        preload: true
      }),
      fail1: new Howler.Howl({
        src: ['sounds/pennywise-1.wav'],
        volume: 1,
        html5: true,
        preload: true
      }),
      fail2: new Howler.Howl({
        src: ['sounds/pennywise-2.wav'],
        volume: 1,
        html5: true,
        preload: true
      }),
      fail3: new Howler.Howl({
        src: ['sounds/pennywise-3.wav'],
        volume: 1,
        html5: true,
        preload: true,
        onplay: () => {
          this.events.emit('game-over-tune-start');
        },
        onend: () => {
          this.events.emit('game-over-tune-end');
        }
      })
    };
  }

  playSound(type) {
    this._soundsList[type].play();
  }
}

module.exports = SoundsBase;