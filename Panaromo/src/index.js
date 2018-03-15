import React, { Component } from "react";
import { render } from "react-dom";
import "./style.css";
import loadGoogleMapsApi from "load-google-maps-api";
import socketIOClient from "socket.io-client";

class Panaromo extends Component {
  constructor() {
    super();
    this.state = {
      endpoint: process.env.REACT_APP_API_URL,
      roominputvalue: "",
      nameinputvalue: "",
      gmarkers: [],
      currentPlaces: [],
      currentPhotos: [],
      selectedPhoto: {},
      joined: false,
      currentroom: {
        gameid: null
      },
      players: [],
      localplayer: {
        name: "",
        role: "guesser"
      },
      gamestate: "stopped",
      timer: 0,
      guessedlocations: [],
      photoselected: false,
      localguessedlocation: {},
      timerrunning: false
    };
  }
  componentWillMount() {
    this.socket = socketIOClient(this.state.endpoint);
  }

  componentDidMount() {
    this.socket.on("photo selected", photo => {
      this.handlePhotoClick(photo);
      this.setGameStateToGuessing();
    });

    this.socket.on("request gamestate", requestid => {
      this.socket.emit(
        "awnser gamestate",
        requestid,
        this.state.timer,
        this.state.gamestate
      );
    });

    this.socket.on("awnser gamestate", (timer, gamestate) => {
      if (gamestate !== "stopped") {
        this.startTimer();
        this.setState({
          ...this.state,
          timer: timer,
          gamestate: gamestate
        });
      }
    });

    this.socket.on("guessed location", (guessedlocation, id, name) => {
      let oldguessedlocation = this.state.guessedlocations.filter(e => {
        return e.socketid === id;
      });

      if (oldguessedlocation.length > 0) {
        this.state.gmarkers.map(e => {
          if (e.position.lat() === oldguessedlocation[0].location.lat) {
            e.setMap(null);
          }
        });
      }

      let newmarker = new this.googleMaps.Marker({
        position: {
          lat: guessedlocation.lat,
          lng: guessedlocation.lng
        },
        map: this.map
      });
      this.setState({
        ...this.state,
        gmarkers: [...this.state.gmarkers, newmarker]
      });
      let newguessedlocations = this.state.guessedlocations.filter(e => {
        return e.socketid !== id;
      });

      newguessedlocations.push({
        name: name,
        socketid: id,
        location: guessedlocation
      });

      this.setState({
        ...this.state,
        guessedlocations: newguessedlocations
      });
    });

    this.socket.on("gamestate guessing", () => {
      this.setState({
        ...this.state,
        gamestate: "guessing",
        timer: 30,
        photoselected: true
      });
    });

    this.socket.on("player joined", (gameinfo, currentplayers) => {
      console.log("player joined");
      if (gameinfo.socketid === this.socket.id) {
        this.setState({
          ...this.state,
          players: currentplayers,
          localplayer: {
            ...this.state.localplayer,
            name: gameinfo.name
          }
        });
      } else {
        this.setState({
          ...this.state,
          players: currentplayers
        });
      }
    });

    this.socket.on("create game", randomplayernumber => {
      console.log(" creating game");

      this.startGame(randomplayernumber);
    });

    loadGoogleMapsApi({
      key: "AIzaSyCl7I79PndPMyJ4AOcboPY_lYda9kf0_40",
      libraries: ["places", "geometry"]
    })
      .then(googleMaps => this.createMap(googleMaps))
      .catch(function(err) {
        console.error(err);
      });
  }

  createMap(googleMaps) {
    this.googleMaps = googleMaps;

    this.map = new googleMaps.Map(this.refs.mapdiv, {
      zoom: 2,
      center: {
        lat: -33.867,
        lng: 151.195
      }
    });

    this.service = new googleMaps.places.PlacesService(this.map);

    this.loadFeatures();
  }

  handleNearbySearch() {
    if (
      this.state.gamestate !== "stopped" &&
      this.state.localplayer.role === "picker"
    ) {
      let request = {
        bounds: this.map.getBounds()
      };
      this.service.nearbySearch(request, (results, status) => {
        this.setState({
          ...this.state,
          currentPlaces: results
        });
        this.getPhotos();
      });
    }
  }

  selectPhoto(photo) {
    this.socket.emit("select photo", photo, this.state.currentroom);
  }

  handlePhotoClick(photo) {
    this.setState({
      ...this.state,
      selectedPhoto: photo,
      timer: 30
    });

    this.removeMarkers();

    this.setState({
      ...this.state,
      gmarkers: []
    });

    let markerposition = {
      lat: photo.lat,
      lng: photo.lng
    };

    if (this.state.localplayer.role === "picker") {
      let marker = new this.googleMaps.Marker({
        position: markerposition,
        map: this.map,
        animation: this.googleMaps.Animation.DROP,
        icon: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
      });
      this.setState({
        ...this.state,
        gmarkers: [marker],
        photoselected: true
      });
    }
  }

  handleGuesserClick(e) {
    if (
      this.state.gamestate === "guessing" &&
      this.state.localplayer.role === "guesser"
    ) {
      let pickedphotolatlng = {
        lat: this.state.selectedPhoto.lat,
        lng: this.state.selectedPhoto.lng
      };

      let pickedobj = new this.googleMaps.LatLng(pickedphotolatlng);

      let distance = this.googleMaps.geometry.spherical.computeDistanceBetween(
        e.latLng,
        pickedobj
      );

      let markerposition = e.LatLng;

      this.setState({
        ...this.state,
        localguessedlocation: {
          lat: e.latLng.lat(),
          lng: e.latLng.lng(),
          distance: distance
        }
      });
      this.socket.emit(
        "guessed location",
        this.state.localguessedlocation,
        this.state.localplayer.name,
        markerposition
      );
    }
  }

  getPhotos() {
    this.setState({
      ...this.state,
      currentPhotos: []
    });
    let amountofphotos = 0;
    this.state.currentPlaces.map(e => {
      amountofphotos++;
      if ("photos" in e && amountofphotos <= 5) {
        e.photos.map((photo, i) => {
          this.state.currentPhotos.push({
            smallurl: photo.getUrl({
              maxWidth: 200,
              maxHeight: 200
            }),
            bigurl: photo.getUrl({
              maxWidth: 500,
              maxHeight: 500
            }),
            lng: this.state.currentPlaces[i].geometry.location.lng(),
            lat: this.state.currentPlaces[i].geometry.location.lat()
          });
        });
      }
      this.setState({
        ...this.state
      });
    });
  }

  loadFeatures() {
    this.map.addListener("click", this.handleGuesserClick.bind(this));
    this.map.addListener("dragend", this.handleDragEnd.bind(this));
    this.map.addListener("zoom_changed", this.handleDragEnd.bind(this));
  }

  handleDragEnd() {
    this.handleNearbySearch();
  }

  createRoom() {
    const min = 100;
    const max = 999;
    const gameid = Math.floor(Math.random() * (max - min + 1)) + min;

    this.socket.emit("room created", {
      gameid: gameid,
      socketid: this.socket.id,
      name: this.state.nameinputvalue
    });

    this.setState({
      ...this.state,
      currentroom: {
        gameid: gameid
      },
      joined: true
    });
  }

  handleRoomInputChange(e) {
    this.setState({
      roominputvalue: e.target.value
    });
  }

  handleNameInputChange(e) {
    this.setState({
      nameinputvalue: e.target.value
    });
  }

  joinRoom() {
    if (this.state.roominputvalue.toString().length === 3) {
      this.socket.emit("joined room", {
        gameid: this.state.roominputvalue,
        socketid: this.socket.id,
        name: this.state.nameinputvalue
      });
      this.setState({
        ...this.state,
        currentroom: {
          ...this.state.currentroom,
          gameid: this.state.roominputvalue
        },
        joined: true
      });
    } else {
      console.log("number lengt not ok");
    }
    console.log(`joining room ${this.state.roominputvalue}`);
    this.socket.emit("request gamestate", this.state.roominputvalue);
  }

  createGame() {
    console.log("creategame");
    this.socket.emit("create game", this.state.players.length);
  }
  removeMarkers() {
    let i;
    for (i = 0; i < this.state.gmarkers.length; i++) {
      this.state.gmarkers[i].setMap(null);
    }
  }

  startGame(randomplayernumber) {
    this.removeMarkers();
    this.setState({
      ...this.state,
      localplayer: {
        ...this.state.localplayer,
        role: "guesser"
      },
      guessedlocations: [],
      selectedPhoto: {},
      gmarkers: []
    });
    let players = this.state.players;
    players.forEach(obj => {
      obj.role = "guesser";
    });

    players[randomplayernumber].role = "picker";

    if (players[randomplayernumber].socketid === this.socket.id) {
      this.setState({
        ...this.state,
        photoselected: false,
        players: players,
        localplayer: {
          ...this.state.localplayer,
          role: "picker"
        },
        gamestate: "started"
      });
    } else {
      this.setState({
        ...this.state,
        players: players,
        photoselected: false,
        gamestate: "started"
      });
    }
    if (this.state.timerrunning) {
      this.setState({
        ...this.state,
        timer: 30
      });
    } else {
      this.startTimer(30);
    }
  }

  startTimer(e) {
    this.setState({
      ...this.state,
      timer: e,
      timerrunning: true
    });
    setInterval(() => {
      if (this.state.timer > 0) {
        this.setState({
          ...this.state,
          timer: this.state.timer - 1
        });
      }
      if (
        this.state.timer === 0 &&
        this.state.gamestate === "started" &&
        this.state.photoselected
      ) {
        this.setState({
          ...this.state,
          gamestate: "guessing",
          timer: 30
        });
      }
      if (
        this.state.timer === 0 &&
        this.state.gamestate === "guessing" &&
        this.state.photoselected
      ) {
        let markerposition = {
          lat: this.state.selectedPhoto.lat,
          lng: this.state.selectedPhoto.lng
        };
        let marker = new this.googleMaps.Marker({
          position: markerposition,
          map: this.map,
          animation: this.googleMaps.Animation.DROP,
          icon: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
        });
        this.setState({
          ...this.state,
          gamestate: "results",
          timer: 10,
          gmarkers: [...this.state.gmarkers, marker]
        });
      }

      if (
        this.state.timer === 0 &&
        this.state.gamestate === "results" &&
        this.state.photoselected
      ) {
        this.createGame();
      }

      if (
        this.state.timer === 0 &&
        this.state.gamestate === "started" &&
        !this.state.photoselected
      ) {
        this.setState({
          ...this.state,
          gamestate: "no photo selected",
          errormessage: "no photo selected",
          timer: 10
        });
      }
      if (
        this.state.timer === 0 &&
        this.state.gamestate === "no photo selected"
      ) {
        this.createGame();
      }
    }, 1000);
  }

  setGameStateToGuessing() {
    this.socket.emit("gamestate guessing");
  }

  render() {
    let { nameinputvalue, roominputvalue, guessedlocations } = this.state;
    let joinbuttonavailable =
      nameinputvalue.length > 0 && roominputvalue.length === 3;
    let createbuttonavailable = nameinputvalue.length > 0;
    let distances = [5];
    guessedlocations.map(e => distances.push(e.location.distance))
    distances.sort(function(a, b) {
      return a - b;
    });
    const resultlist = () => {distances.map((e, i) => {
      let message;
      

      guessedlocations.map((obj) => {
        if (obj.location.distance && obj.location.distance === e) {
          
          message = (
            <li style={i === 1 ? styles.firstplace : {}}>
              {" "}
               {obj.name}: {

                 obj.location.distance > 1000 ? <span>{(obj.location.distance/1000).toFixed(1)}km </span> : <span> {obj.location.distance.toFixed(1)}m </span>
                 
                 }{" "}
            </li>
          );
        }
      });
      return message;
    })}
    
    

    return (
      <div>
        {this.state.joined ? (
          <div>
            {this.state.timer >= 1 ? (
              <div id="timer">
                {" "}
                <h1> {this.state.timer} </h1>{" "}
              </div>
            ) : null}

            <div className="gameid">
              {" "}
              <div id='room'> Room </div> <div id='roomnumber'> {this.state.currentroom.gameid} </div> {" "}
              <ul>
              {this.state.players.map((e, i) => {
                return (
                  <li key={i}>
                    <h1>
                      {" "}
                       {e.name} ({e.role})
                    </h1>{" "}
                  </li>
                );
              })}{" "}
              </ul>
            </div>

            {this.state.localplayer.role === "picker" &&
            this.state.gamestate === "started" ? (
              <div>
                {" "}
                <div className="selectaphoto">
                  <h1> Browse the map and select a photo </h1>{" "}
                </div>{" "}
                <div className="photocontainer">
                  {this.state.currentPhotos.map((e, i) => (
                    <div className="photo">
                      {" "}
                      <img
                        alt=""
                        key={i}
                        src={e.smallurl}
                        onClick={() => this.selectPhoto(e)}
                      />{" "}
                    </div>
                  ))}
                </div>{" "}
              </div>
            ) : null}
            <div className="selectedphotocontainer">
              {this.state.localplayer.role === "guesser" &&
              this.state.gamestate === "started" ? (
                <h1> Wait for the picker to pick a photo... </h1>
              ) : (
                <h1> Selected Photo </h1>
              )}
              <img
                id="selectedphoto"
                alt=""
                src={this.state.selectedPhoto.bigurl}
              />
            </div>
            {this.state.gamestate === "stopped" ? (
              <button id="startgamebutton" onClick={this.createGame.bind(this)}>
                {" "}
                Start Game{" "}
              </button>
            ) : null}
          </div>
        ) : null}
        {!this.state.joined ? (
          <div className="loginfield">
            <input
              style={styles.nameinputfield}
              type="text"
              value={this.state.nameinputvalue}
              onChange={this.handleNameInputChange.bind(this)}
              placeholder="write your name"
            />
            <button
              style={Object.assign(
                {},
                styles.createbutton,
                createbuttonavailable && styles.createbuttonenabled
              )}
              onClick={e => {
                if (createbuttonavailable) {
                  this.createRoom();
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              Create
            </button>

            <input
              style={styles.roominputfield}
              type="number"
              value={this.state.roominputvalue}
              onChange={this.handleRoomInputChange.bind(this)}
              placeholder="join a room"
            />

            <button
              style={Object.assign(
                {},
                styles.joinbutton,
                joinbuttonavailable && styles.joinbuttonenabled
              )}
              onClick={e => {
                if (joinbuttonavailable) {
                  this.joinRoom();
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              {" "}
              Join{" "}
            </button>
          </div>
        ) : null}
        {this.state.gamestate === "results" ? (
          <div id="results">
            {" "}
            <h1>
              {" "}
              Results{" "}

              </h1>
              <ul>
              
              </ul>{" "}
            {" "}
          </div>
        ) : null}
        {this.state.gamestate === "no photo selected" ? (
          <div id="errormessage">
            {" "}
            <h1> No photo selected </h1>{" "}
          </div>
        ) : null}

        {this.state.gamestate === "guessing" &&
        this.state.localplayer.role === "guesser" ? (
          <div id="message">
            {" "}
            <h1> Click on the map to guess the location of the photo. </h1>{" "}
          </div>
        ) : null}

        <div className="map" ref="mapdiv" />
      </div>
    );
  }
}

const styles = {
  firstplace: {
    backgroundColor: 'rgb(155, 211, 133)'
  },
  nameinputfield: {
    top: "10%",
    margin: 15,
    width: "70%",
    outline: "none",
    fontSize: 15,
    padding: 10,
    border: "none",
    backgroundColor: "#ddd",
    marginTop: 10
  },
  roominputfield: {
    top: "10%",
    margin: 15,
    width: "70%",
    outline: "none",
    fontSize: 15,
    padding: 10,
    border: "none",
    backgroundColor: "#ddd",
    marginTop: 10
  },
  joinbutton: {
    display: "inline-block",
    margin: 5,
    width: 100,
    height: 40,
    border: "none",
    borderRadius: 4,
    fontSize: 20,
    transition: ".25s all",
    backgroundColor: "rgba(160, 165, 157, 0.8)",
    border: "2px solid rgba(0, 0, 0, 0.5)"
  },
  joinbuttonenabled: {
    backgroundColor: "rgba(139, 204, 104, 0.8)",
    width: 120,
    border: "2px solid green"
  },
  createbutton: {
    margin: 5,
    width: 100,
    height: 40,
    border: "none",
    borderRadius: 4,
    fontSize: 20,
    cursor: "default",
    transition: ".25s all",
    backgroundColor: "rgba(160, 165, 157, 0.8)",
    border: "2px solid rgba(0, 0, 0, 0.5)"
  },
  createbuttonenabled: {
    backgroundColor: "rgba(139, 204, 104, 0.8)",
    width: 120,
    border: "2px solid green"
  }
};

render(<Panaromo />, document.getElementById("root"));
