import api from "../api.js"
async function init() {

    let result= await api.getFiles()

    let divVideos = document.getElementById("container-videos")
    let fragment = document.createDocumentFragment()

    for (let i = 0; i < result.length; i++) {
        let element = result[i]

        let $a = document.createElement('a')
        let $figure = document.createElement('figure')
        let $img = document.createElement('img')
        let $figcaption = document.createElement('figcaption')

        $a.href = `/video?folderName=${element.folderName}`
        $img.src = "img/play.jpg"

        
        $a.appendChild($figure)
        $figure.appendChild($img)
        $figure.appendChild($figcaption)

        $figcaption.appendChild(document.createTextNode(element.nameFile))
        fragment.appendChild($a)
    }

    divVideos.appendChild(fragment)

}
init()
