function addSong() {
 alert("1");
    
 let songInput = document.getElementById("songInput");
 alert("2");

   let songName = songInput.value;
alert("3");
   if ( songName !== ""){
alert("4");
   let newSong = document.createElement("li");
    alert("5");
    
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
  
