function addSong() {
   
   alert(Function Works!");
      
   let songInput = document.getElementById("songInput");

   let songName = songInput.value;

   if ( songName !== ""){

   let newSong = document.createElement("li");

    newSong.textContent = songName;

   let songList = document.getElementById("songList");
      
   let deleteButton = document.createElement("button");
   
   deleteButton.textContent = "Delete";
      
   deleteButton.onclick = function() {
      newSong.remove();
   };
      
   newSong.appendChild(deleteButton);
      
   songList.appendChild(newSong);
      
   songInput.value = ""
      
   }    
}
  
