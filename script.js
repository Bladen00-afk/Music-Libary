function addSong() {
    
 let songInput = document.getElementById("songInput");

   if ( songInput.files.length > 0 ){
    let file  = songInput.files[0]
       
   let newSong = document.createElement("li");
       
       let songName = file.length;
    
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
  
