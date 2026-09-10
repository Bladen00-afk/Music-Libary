function addSong() {
   let songInput = document.getElementById("songInput");

   let songName = songInput.value;

   if ( songName !== ""){

   let newSong = document.createElement("li");

    newSong.textContent = songName;

   let songList = document.getElementById("songList");

   songList.appendChild(newSong);

   songInput.value = ""
      
   let deleteButton = document.createElement("Button");
   
   deleteButton.textContent = "Delete"
      
   deleteButton.onclick = function() {
    
      newSong.remove();
   };
      
   newSong.appendchild("deleteButton");

   
}
  
