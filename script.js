function addSong() {
   let songInput = document.getElementById("songInput");

   let songName = songInput.value;

   let newSong = document.createElement("li");

    newSong.textContent = songName;

   let songList = document.getElementbyId("songList");

    songList.appendChild(newSong);


}
  
