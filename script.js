function addSong() {
   let songInput = document.getElementById("songInput");

   let songName = songInput.value;

   if ( songName === ""){
      then songInput.value = ""

   let newSong = document.createElement("li");

    newSong.textContent = songName;

   let songList = document.getElementById("songList");

   songList.appendChild(newSong);

   songInput.value = ""
   

   
}
  
