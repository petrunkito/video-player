//api file
async function getFile(idFile) {
    try {
        let response = await fetch(`http://localhost:3000/api/files/${idFile}`)
        if (!response.ok) throw new Error('data collection failed')
        let data = (await response.json()).result
        return data
        /*data: 
            {
                "ok": true,
                "result": {
                "_id": "653b329b354e98de975b53b4",
                "nameFile": "videorecortado.mp4",
                "size": "783403",
                "folderName": "ffd33306-9192-4dd9-92e4-79ae5444d834",
                "__v": 0
                }
            }
        */
    } catch (err) {
        console.log(`getFile api error: ${err.message}`)
        return false
    }

}

async function getFiles() {
    try {
        let response = await fetch(`http://localhost:3000/api/files`)
        if (!response.ok) throw new Error("data collection failed")
        let data = (await response.json()).result
        return data
        /*data:
        [
            {
                "_id": "653b329b354e98de975b53b4",
                "nameFile": "videorecortado.mp4",
                "size": "783403",
                "folderName": "ffd33306-9192-4dd9-92e4-79ae5444d834",
                "__v": 0
            },
            {
                "_id": "653c3b645a8b084330b7c17b",
                "nameFile": "10000000_855466678577442_6641666913059859207_n.mp4",
                "size": "11232700",
                "folderName": "9b78ff2e-3caa-4a16-beff-bac299072aca",
                "__v": 0
            },
            {
                "_id": "653c40755a8b084330b7c180",
                "nameFile": "Believer - Imagine Dragons - Violin Cover by Karolina Protsenko.mp4",
                "size": "55954825",
                "folderName": "a60f259f-d873-4935-b9bf-e5b63893d43f",
                "__v": 0
            }
        ]
        
        */
    } catch (err) {
        console.log(`getFiles api error: ${err.message}`)
        return false
    }
}
///////////////////////////////////////////////////////////////////////////////////////////////////
//api playlist

async function getPlaylist(folderName) {
    try {
        let response = await fetch(`http://localhost:3000/api/playlist/${folderName}`)
        if (!response.ok) throw new Error("data collection failed")
        let data = (await response.json()).result
        return data
        /*data:[
            {
                "_id": "653d9adeadcc11fbfd18d001",
                "folderName": "dbff3a41-d288-4efa-ae88-5d2dd643a777",
                "resolutions": [
                    "426x240",
                    "640x360"
                ],
                "fragments": [
                    {
                        "resolution": "426x240",
                        "manifest": "240p.m3u8",
                        "files": [
                            "240p_000.ts",
                            "240p_001.ts",
                            "240p_002.ts"
                        ],
                        "_id": "653d9adeadcc11fbfd18d002"
                    },
                    {
                        "resolution": "640x360",
                        "manifest": "360p.m3u8",
                        "files": [
                            "360p_000.ts",
                            "360p_001.ts",
                            "360p_002.ts"
                        ],
                        "_id": "653d9adeadcc11fbfd18d003"
                    }
                ],
                "__v": 0
            },
            ...
        ]
        */
    } catch (err) {
        console.log(`getPlaylist api error: ${err.message}`)
        return false
    }
}


async function getPlaylists() {
    try {
        let response = await fetch(`http://localhost:3000/api/playlist`)
        if (!response.ok) throw new Error("data collection failed")
        let data = (await response.json()).result
        return data
        /*data:
        [
            {
                "_id": "653d9adeadcc11fbfd18d001",
                "folderName": "dbff3a41-d288-4efa-ae88-5d2dd643a777",
                "resolutions": [
                    "426x240",
                    "640x360"
                ],
                "fragments": [
                    {
                        "resolution": "426x240",
                        "manifest": "240p.m3u8",
                        "files": [
                            "240p_000.ts",
                            "240p_001.ts",
                            "240p_002.ts",
                        ],
                        "_id": "653d9adeadcc11fbfd18d002"
                    },
                    {
                        "resolution": "640x360",
                        "manifest": "360p.m3u8",
                        "files": [
                            "360p_000.ts",
                            "360p_001.ts",
                            "360p_002.ts",
                        ],
                        "_id": "653d9adeadcc11fbfd18d003"
                    }
                ],
                "__v": 0
            },... 
        ]
        */
    } catch (err) {
        console.log(`getPlaylists api error: ${err.message}`)
        return false
    }
}
///////////////////////////////////////////////////////////////////////////////////////////////////
//api uploader

async function postUploader(files){
    try{
        let data = new FormData()
        files.forEach((element, index) => {
            data.append(`video${index}`, element)
            
        });
        let response = await fetch(`http://localhost:3000/api/uploader`,
        {
            method:"POST",
            headers:{
                "Content-Type":"multipart/form-data"
            },
            body:data
        })
        if(!response.ok) throw new Error("An error occurred while uploading the files")
        return response.ok
    }catch(err){
        console.log(`postUploader api error: ${err.message}`)
        return false
    }
}
///////////////////////////////////////////////////////////////////////////////////////////////////
//api fragments
async function getFragment(folderName, params){
    try{
        let response = await fetch(`http://localhost:3000/api/fragments/${folderName}?${params}`)
        if(!response.ok) throw new Error("An error occurred while getting a video snippet")
        let arrayBuffer = await response.arrayBuffer()
        return arrayBuffer
    }catch(err){
        console.log(`getFragment api error: ${err.message}`)
        return false
    }
}

export default {
    getFile, getFiles, getPlaylist, getPlaylists, postUploader, getFragment
}