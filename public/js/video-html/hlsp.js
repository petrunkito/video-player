//?usamos este modulo para usar la api del servidor
//!Nota: si desea ver, que regresa cada metodo de la api, dirigete hacia el archivo "api.js"
import api from "../api.js"

async function start(videoElement, config={}) {
    try {
        //?obtenemos los parametros de la url, y obtenemos el valor del "foldername" que es la carpeta donde se encuentran 
        //?los fragmentos del video en el servidor
        const urlSearchParams = new URLSearchParams(window.location.search);
        const folderName = urlSearchParams.get("folderName");

        // let videoElement = document.querySelector('video')
        const mime = 'video/mp4; codecs="mp4a.40.2,avc1.64001f"'//?le indicamos al navagador que codificacion de video y audio usara
        let record = new Set()//?llevamos un registro de los fragmentos que se van descargando
        //?cuando se descargan los fragmentos, los guardaremos aqui, mientras se agregan al sourceBuffer
        //?este es el formato que seguiremos [{buff:Uint8Array(789600), pos:0}]
        let arrayBufferStorage8 = []

        //?estas variables cambiaran en el transcurso del programa(e.j.p: se cambia de resolucion)
        let transmuxer//?aqui guardaremos una instancia de  mp4.Transmuxer(), para que parsee los fragmentos y los haga reproducibles a formato mp4, esta es una libreria externa, que le ayuda al navegador
        let mediaSource//?el mediaSource nos permitira gran control sobre los fragmentos como cambiar resolucion de video, establecer la duracion total del video, agregarle un sourceBuffer, cerrar el flujo de datos etc.
        let sourceBuffer//?el sourceBuffer sera asociado al mediaSource. Este se encarga de recibir los fragmentos, e indicarnos su estado, los fragmentos almacenados, etc. 

        //?este objeto, almacenara algunos datos importantes, que seran usados a lo largo de todo el programa
        let hlsElement = {
            files: [],//aqui guardamos toda la informacion del video(resoluciones disponibles, manifiesto, nombre del fragmento junto con su tiempo de duracion)
            velocity: 0,//la velocidad promedio del internet en megabits por segundo(Mb)
            position: 0,//la posicion del fragmento actual que se esta reproduciendo
            currentResolution: "",//la resolucion actual como '426x240', '640x360', '842x480', '1280x720'
            currentResolutionPosition: 0,//la posicion de la resolucion que se esta reproduciendo
            resolutions: [],//todas las resoluciones disponibles para este video['426x240', '640x360', '842x480', '1280x720']
            totalFragments: 0,//la cantidad de fragmentos totales a reproducir
            videoDuration: 0,//la duracion total del video
            allFragmentsDownloaded: false,//indica si todos los fragmentos fueron descargados(true) o aun no han sido descargados todos(false)
            conexion: true,//indica que la conexion no sea perdido o que el servidor manda conrrectamente los fragmentos(true) o indica que no hay internet o se callo el servidor(false), mas usada para saber si tenemos conexion a internet

            //?Estos son los unicos campos que el usuario puede personalizar, en un dado caso que no pase los datos, se usaran los datos por defecto
            timeSpace: config.lastData || 1500,//este indica el tiempo que hay que esperar entre cada accion, por ejemplo(reconexion, adelanto del video, cambio de resolucion)
            keyQuality: config.keyQuality || "quality_video",//este valor lo usamos para la clave del "localStorage" que almacenara la resolucion del video que eligio el usuario
            keyVolume: config.keyVolume ||"volume_video",//este valor lo usamos para la clave del "localStorage" que almacenara el volumen del video que eligio el usuario
            lastData: config.lastData || 2//indica, cuantos fragmentos posteriores tendremos descargados por adelantado, para permitir que el video se reprodusca con fluidez
        }

        videoElement.addEventListener('timeupdate', _automaticDownload)//?el metodo "_automaticDownload" que descarga los siguientes fragmentos de manera automatica, se dispara cada que se este reproduciendo el video
        videoElement.addEventListener('seeking', _searchFragment)//?el metodo "searhFragment" busca un fragmento del video, cada que el usuario adelante o retroceda en la reproduccion del video
        videoElement.addEventListener("waiting", _videoFinish)//?el metodo "_videoFinish" retorna un "true" cuando el video a finalizado sin descargar aun todos los fragmentos, por eso usamos el evento "waiting"

        //?configura el valor de algunas variables antes de empezar a reproducir el video
        //?una vez terminado, se ejecuta el callback que nos pasan como parametro
        async function _init(cb) {
            transmuxer = new muxjs.mp4.Transmuxer()//?instanciamos a la clase mp4.Transmuxer()
            transmuxer.on('data', _addFragment)//?cada que insertemos un fragmento al sourceBuffer del mediaSource, se ejecutara esta funcion, activando el evento data
            mediaSource = new MediaSource()//?instanciamos la clase MediaSource(), para poder tener gran control sobre los video que se reproducen
            videoElement.src = URL.createObjectURL(mediaSource)//?enlazamos el mediaSource a nuestro elemento de tipo "<video>"(esto nos devuelve una URL de tipo blob, con un uuii unico)
            await volume()//?configuramos el volumen por defecto, o si tenemos alguno almacenado

            /**Events */
            mediaSource.addEventListener('sourceopen', cb, { once: true })//?cuando el mediaSource quede enlazado con el video, ejecutamos el callback, una unica vez
            mediaSource.addEventListener('sourceended', () => _emit("close"))//?si el flujo del mediaSource se cierra, disparamos el evento "close" indicando que se cierra el flujo al mediaSource
        }

        //?cambia el volumen del video, los valores que recibe son 0 hasta 1
        //!Nota: si pasamos un numero menor a 0 y mayor a 1, esto arroja un error
        async function volume(num) {
            if (num && (num >= 0 && num <= 1)) {//?si el usuario modifica el volumen y ese numero esta en el rango de 0 a 1, tambien lo agrega al localStorage
                videoElement.volume = num
                localStorage.setItem(hlsElement.keyVolume, num)
            } else if (localStorage.getItem(hlsElement.keyVolume)) {//?si el usuario, no elegie el volumen, se usara el que esta almacenado en el localStorage
                let value = parseFloat(localStorage.getItem(hlsElement.keyVolume))
                if (value >= 0 && value <= 1) { videoElement.volume = value } else videoElement.volume = 1 //?usamos parseFloat() porque nos getItem() nos regresa un string
            } else {//?si ninguno de los casos anteriores tuvo exito, entonces establecemos por defecto el volumen en 1
                videoElement.volume = 1
            }
        }

        //?ejecutamos el callback, cuando la funcion _init() termine de ejecutar el resto del codigo
        //!Nota: la funcion "_init()" es la que comienza todas las operaciones, es la funcion principal, desde la que inician
        //!las configuracion y asignaciones de listeners
        await _init(async () => {
            _emit("ready")//?emitimos el evento "ready" para indicar que el objeto "mediaSource" esta listo para usarse
            URL.revokeObjectURL(mediaSource)//?liberamos recursos, liberando el enlace del video y el mediaSource(esto no afecta la reproduccion y el resto del codigo)
            sourceBuffer = mediaSource.addSourceBuffer(mime)//?creamos el sourceBuffer, indicandole que tipo de video reproducira, y los decodificadores que usara
            sourceBuffer.addEventListener("updateend", _isThereFragments)//?cuando se termine de agregar un fragmento de video al "sourceBuffer", se activa el evento "updateend" y comprobara si hay mas fragmentos en la cola, para seguir insertandolos
            sourceBuffer.addEventListener("updateend", _closeStream)//?cuando se termine de agregar un fragmento al "sourceBuffer" se activara el evento "updateend", comprobara si este es el ultimo fragmento, para cerrar el stream del video(significa que cerrara la entrada de mas datos)

            await _initHlsElement()//?inicializamos nuestro objeto "hlsElement" con algunos valores de utilidad al principio como duracion total del video, cantidad de fragmentos, las resoluciones disponibles, etc...
            mediaSource.duration = hlsElement.videoDuration//?le indicamos al "mediaSource" la duracion total del video
            await _downloadFragment([0])//?descargamos el primer fragmento, que corresponde a la posicion 0
        })

        //?inicializa nuestro objeto 'hlsElement' con algunos datos basicos e importantes para el uso del programa al principio y en el transcurso de su ejecucion
        async function _initHlsElement() {

            let resultado = await api.getPlaylist(folderName)//?obtenemos la informacion completa de los fragmentos de un video especifico, como resoluciones, archivos y manifiestos y mucho mas.
            hlsElement.files = resultado.fragments//?obtenemos los fragmentos disponibles, junto con su resolucion y manifiestos
            hlsElement.resolutions = resultado.resolutions//?las resoluciones disponibles para ese video ["426x240","640x360", "842x480", "1280x720", ...]
            hlsElement.currentResolution = resultado.resolutions[0]//?la resolucion actual, en la que se esta reproduciendo el vidoe, por defecto la calidad de reproduccion sera de la calidad mas baja, para luego ser mejora de manera automatica o manual
            hlsElement.totalFragments = resultado.fragments[0].files.length//?el numero de fragmentos que podemos reproducir
            //?obtenemos la duracion total del video, usando el metodo reduce
            //!Nota: recordar que es irrelevante si elegimos la posicion de un fragmento u otro "fragments[0]" ya que sea la resolucion que sea
            //! todos tendran la misama cantidad de tiempo
            hlsElement.videoDuration = parseInt(resultado.fragments[0].files.reduce((acumulador, valorActual) => {
                //valorActual --> {"240p_000.ts":"10.001"},{"240p_001.ts":"10.001"}, {240p_002.ts:"3.001"}
                let time2 = parseFloat(Object.values(valorActual)[0])//"10.001", "10.001", "3.001", ... obtenemos solo el tiempo y lo vamos sumando
                return acumulador + time2
            }, 0))
        }

        //?descargamos los fragmentos que nosotros le indiquemos, pasando un arreglo con las posiciones de los fragmentos
        async function _downloadFragment(positionFragments /*= [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]*/) {
            //?la funcion "_checkNextDownload()" nos sirve para revisar si los fragmentos a descargar cumplen siertas restricciones
            //?si la varaible "positionFragments" tiene a un valor false, entonces no hay que descargar nada
            positionFragments = await _checkNextDownload(positionFragments)
            if (!positionFragments) return

            //?iteramos sobre "positionFragments" que es un conjunto "new Set()", que contiene las posiciones de los fragmentos a
            //?descargar
            let arr = []//?en el arreglo "arr" almacenaremos las "promesas" de la peticion a la api
            for (let item of positionFragments) {
                //?el metodo "getFragment" recibe dos parametros el folderName(el nombre de la carpeta de los fragmentos en el servidor)
                //?y los parametros position(la posicion del fragmento) y resolution(la resolucion del fragmento), esto nos devolvera
                //?el fragmento deseado en la resolucion deseada.
                //?y cada promesa la almacenamos en el arreglo "arr"
                arr.push(api.getFragment(folderName, `position=${item}&resolution=${hlsElement.currentResolution}`))
            }
            //?el metodo "volocity" calculara la velocidad promedio de descarga de los fragmentos, y nos regresa sin alterar
            //?el resultado de "Promise.all()"
            //!Nota: recordar que el metodo "Promise.all()" nos regresa todas las promesas resueltas
            //?la variable "ArrayBuffers" almacena los fragmentos los objetos de tipo "ArrayBuffer(462668)" 
            let arrayBuffers = await _velocity(() => Promise.all(arr))//arrayBuffers --> [ArrayBuffer(462668), ArrayBuffer(466052)]

            //?si, la variable "arrayBuffers" tiende a ser un valor "false", eso quiere decir que algun fragmento no se descargo
            //?correctamente o se perdio la conexion con el servidor, o se perdio la conexion a internet
            if (!arrayBuffers) {
                //?si ocurrio algun problema, usamos el metodo de "_reconexion()", que tratara de conectarse con el servidor
                //?y descargar los fragmentos necesarios, para reanudar la reproduccion del video
                await _reconexion()
                return
            }
            _emit("download")//?disparamos el evento "download" para indicar que se descargaron uno o varios fragmentos
            //?si, los fragmentos se descargaron de manera exitosa, unamos la funcion "_queue()" que inserta los fragmentos
            //?uno por uno, en el orden que fueron descargados, funciona como una cola de tareas.
            await _queue(arrayBuffers, Array.from(positionFragments))
        }

        //?esta funcion se encarga de analizar si se debe descargar o no el siguiente o los siguientes fragmentos del video
        //?siguiendo siertas pautas
        async function _checkNextDownload(positionFragments = []) {//?recibe como parametro unico, las posiciones de los fragmentos que debe descargar asi: [0,1,2]
            if (hlsElement.allFragmentsDownloaded) return false//? si, se descargaron todos los fragmentos, retornamos un false, indicando que no se debe descargar los fragmentos
            //?si el tamaño del registro de fragmentos descargados es igual a la cantidad de fragmentos disponibles, 
            //?eso siginifica que no necesitamos descargar mas elementos, y mandamos un false
            if (record.size >= hlsElement.totalFragments) return false
            //?si la conexion del internet o la conexion del servidor se han perdido, entonces no mandamos a descargar nada por obvias razones, en ese caso, retornamos un false
            if (!hlsElement.conexion) return false

            //?creamos un conjunto, para obtener solo fragmentos unicos
            let set = new Set(positionFragments)
            for (let item of set) {
                if (record.has(item)) set.delete(item)//?si esa posicion del fragmento ya se encuentra en el registro, encontes lo elimnamos para no volver a descargarlo
                //?si el valor de la posicion es igual o mayor a la cantidad total de fragmentos, eso indica que se quiere descargar un fragmento que no es valido, asi que por eso lo eliminamos
                //!Nota: recordar que la posicion de los fragmentos empieza desde la posicion 0 asi: [fragmento0, fragmento1, fragmento2].
                //!Si la posicion del fragmento es igual a 3, esto quiere decir que busca en la posicion 3, y ese fragmento no se encuentra, 
                //!como en el ejemplo dado.
                if (item >= hlsElement.totalFragments) set.delete(item)
                //?si el item tiene un valor menor a 0, eso indica que quiere descargar un fragmento invalido
                if (item < 0) return false
            }
            //?si la longitud del "set" es cero, eso quiere decir que esos fragmentos ya se habian descargado, y por ende, mandamo sun false, indicando que no
            //?se descargara ningun elemento
            if (set.size === 0) return false
            //?si todo ocurrio de manera exisa, mandamos los fragmentos que aun no se an descargado
            return set
        }

        //?calculamos la velocidad promedio de todos los fragmentos que se van descargando
        let mediaDownload = []
        async function _velocity(cb) {
            //?calculamos el tiempo que toma para descargar todos los fragmentos necesarios
            let t1 = new Date()
            let datos = await cb()
            let t2 = new Date()

            let Ts = (t2 - t1) / 1000//?obtenemos el tiempo transcurridos en segundos

            //?si alguna descarga falla, esta nos retornara un "false" asi: [ArrayBuffer, false, ArrayBuffer] por ende, solo 
            //?filtramos los elementos que se descargaron, y si todas fallaron asi: [false, false, false], encontes
            //?retornamos un false
            datos = datos.filter(element => element)
            if (!datos.length) return false

            //!la longitud nos la devuelve en bytes
            //?obtenemos la cantidad de bytes totales sumando la longitud de cada archivo.
            let longitud = datos.reduce((acumulador, valorActual) => {
                return acumulador + valorActual.byteLength
            }, 0)

            //?agregamos la velocidad de descarga en megabits por segundo
            let velocityInBits = (longitud / 125000) / Ts
            mediaDownload.push(velocityInBits)

            //?obtenemos la media de velocidad de descargas
            hlsElement.velocity = mediaDownload.reduce((acumulador, actual) => acumulador + actual, 0) / mediaDownload.length;

            //?la funcion "_setUpVideoQuality()" configura de manera automatica la calidad de reproduccion del video,
            //?dependiendo de la media de descarga de los fragmentos, entre mas alta es la media de descarga
            //?podra establecer de manera automatica la calidad mas alta que se puede reproducir
            //?sin que se congele el video
            await _setUpVideoQuality(hlsElement.velocity)
            //?retornamos los fragmentos descargados en tipos de datos "ArrayBuffer"
            return datos
        }

        //?cambia de manera automatica la calidad de los fragmentos a la mas optima, esto depende de la velocidad media
        //?de descarga.
        async function _setUpVideoQuality(promedio) {
            //?los megabits requeridos para cada resolucion
            const qualities = {
                "426x240": "1",
                "640x360": "2",
                "842x480": "4",
                "1280x720": "8",
                "1920x1080": "16"
            }

            //?comprobamos si el usuario, ya habia elegido una resolucion de su preferencia y que ademas
            //?tal resolucion sea soportada por el video
            let quality = localStorage.getItem(hlsElement.keyQuality)
            if (quality && hlsElement.resolutions.includes(quality)) {
                //?indicamos la resolucion que se esta reproduciendo y su posicion correspondiente
                hlsElement.currentResolution = quality//?la resolucion que se debe reproducir y descargar
                hlsElement.currentResolutionPosition = hlsElement.resolutions.indexOf(quality)//?la posicion de dicha resolucion
                return
            }

            //?si el usuario no tiene una resolucion de preferencia, esta se establecera de manera automatica

            //?buscamos la resolucion mas alta que soporte la red, y que al mismo tiempo sea soportada por el video,
            //?obteniendo asi el indice de dicha resolucion
            const index = Object.entries(qualities).findLastIndex(([quality, megaBitsRequired]) => {
                //?obtenemos la resolucion mas alta que sea soportada por la red y que sea soportada por el video
                if (promedio > parseInt(megaBitsRequired) && hlsElement.resolutions.includes(quality)) {
                    return true;
                }
            });

            hlsElement.currentResolution = Object.keys(qualities)[index];//?la resolucion que se debe reproducir y descargar
            hlsElement.currentResolutionPosition = index;//?la posicion de dicha resolucion
        }

        //?intenta repetidamente comprobar la conexion a internet o si el servidor dejo de enviar informacion
        function _reconexion() {
            _emit("errorconexion")//?disparamos el evento "errorconexion" cuando se tenga problemas con la red o el servidor
            //?establecemos esta propiedad en false, para que no se intenten descargar mas fragmentos
            //?mientras la funcion se encarga de reconectar a internet o al servidor
            hlsElement.conexion = false
            let test
            //?cuando, volvamos a establecer conexion con el servidor, resolvemos la promesa
            return new Promise((resolve) => {
                async function rec() {
                    //?para saber si la conexion al servidor o internet es correcta, usamos la funcion "getPlaylist"
                    //?unicamenta para testear si hay conexion
                    test = await api.getPlaylist(folderName)
                    if (test) {
                        //?si se restablecio la conexion, eliminamos el interval
                        clearInterval(intervalo)
                        //?la funcion "_getIndex" nos regresa la posicion del fragmento actual que se esta reproduciendo,
                        //?para esto le pasamos el tiempo en el que se dejo de reproducir el video y obtenemos la posicion
                        //?del fragmento correspondiente.
                        let index = await _getIndex()
                        hlsElement.conexion = true//?habilitamos la descargas
                        //?descargamos el fragmento 0(por cuestiones de compatibilidad y secuencia del video), descargamos el fragmento index el cual
                        //?se esta reproduciendo(esto por que el usuario pudo haber adelantado el video a un tiempo diferente)
                        //?y descargamos la siguiente posision del fragmento actual index + 1(esto es para dar continuidad a la reproduccion del video)
                        await _downloadSeveralFragmentsAfter()
                        //?resolvemos la promesa, con un valor true
                        resolve(true)
                        _emit("successfulreconnection") //?disparamos el evento "successfulreconnection" cuando regrese la conexion a internet o al servidor
                    }
                }

                //?en intervalos de 5 segundos, ejecutamos la funcion "rec", que se encargara de 
                //?revisar la conexion y descargar los fragmentos correspondientes
                let intervalo = setInterval(rec, 5000)
            })
        }

        //?esta funcion tiene dos funcionalidades, la primera de guardar la cantidad de fragmentos
        //?en el orden indicados, en un arreglo.
        //?La segunda funcionalidad, es que cuando se llama sin pasar ningun parametro, nos regresa 
        //?un buffer en el orden que fueron agregaods(FIFO) como las colas de tareas.
        async function _queue(arrayBuffers = false, positions = false) {//!recibe los ArraysBuffer(arrayBuffers) y sus posiciones(positions) respectivas
            //?los elementos se guardan en este formato: [{buff:Uint8Array, pos:0}, {buff:Uint8Array, pos:1}, ...]

            //?si no pasamos ningun elemento, regresamos el primer fragmento, que aun no ha sido consumido
            if (!arrayBuffers) {
                let filter = null
                let pos = 0
                //?obtenemos el primer elemento que cumpla con la condicion, la cual es:
                //?extraer el primer elemento que aun no ha sido consumido, ejem: [{buff:false, pos:0}, {buff:Uint8Array, pos:1}, ...]
                //?en este caso, retornamos el buffer que esta en la posicion "1" y le pasamos un valor false luego asi:
                //?[{buff:false, pos:0}, {buff:false, pos:1}, ...]
                filter = arrayBufferStorage8.find((element, index) => {
                    if (element.buff) {
                        pos = index
                        return true
                    }
                })
                if (!filter) return -1//?retornamos -1, si todos los frgmentos ya fueron consumidos
                filter = filter.buff//?obtenemos unicamente el 'buff' que contiene el ArrayBuffer
                arrayBufferStorage8[pos].buff = false//?indicamos que ya lo consumieron
                return filter//?retornamo sel buff, para que se agregue al sourceBuffer
            }
            //?agregamos la cantidad de fragmentos en el arreglo "arrayBufferStorage8" en tipo de dato Unit8Array
            //?para que sea consumido por el sourceBuffer
            for (let i = 0; i < arrayBuffers.length; i++) {
                arrayBufferStorage8.push({ buff: new Uint8Array(arrayBuffers[i]), pos: positions[i] })
                record.add(positions[i])//?agregamos al registro las posiciones que ya fueron descargadas, para no volver a descargarlas en el futuro
            }
            //?una vez que se inserten los Buffers en el arreglo "arrayBufferStorage8"
            //?ejecutamos la funcion "_insert()", esto para indicar que se agrego un nuevo fragmento
            //?y debe ser insertado al sourceBuffer
            await _insert()
        }

        //?inserta un fragmento que se descargo, y lo elige en el orden que se inserto(FIFO)
        async function _insert() {
            //?si el sourceBuffer no esta agregando fragmentos(updating = false) y si el mediaSource
            //?sigue abierto(readyState = "open"), insertamos el primer fragmento
            if (sourceBuffer.updating === false && mediaSource.readyState === "open") {
                //?primero usamos el metodo "push()" el cual recibe un typeArray en este caso un 'Uint8Array'
                //?el cual activara el evento "data" de "transmuxer" ejecutando la funcion "_addFragment()"
                transmuxer.push(await _queue())
                //?el metodo flush es requerido segun la documentacion de "mux.js"
                transmuxer.flush()
            }
        }

        //?agrega los fragmentos al sourceBuffer
        //!Nota: leer atentamente la documentacion, este metodo forma la parte principal del proyecto
        let firstFragment = true
        async function _addFragment(segment) {//?recibe un "segment" que es pasado gracias al metodo transmuxer.push()
            //!Nota: para que comprendas, por regla estricta, el primer fragmento que se debe insertar al "sourceBuffer"
            //!tiene que ser el primer segmento del video, si agregas otro fragmento que no sea el primero, ocurririan 
            //!muchos problemas, ya que apartir del primer fragmento, el "mediaSource" sabra posicionar correctamente
            //!los demas fragmentos del video, eso quiere decir que el fragmento 2 jamas va a la par de un fragmento 5,
            //!tiene que ser en el orden natural de los fragmentos asi: [0,1,2] y todo eso se logra gracias aque
            //!insertamos el primer segmento/fragmento del video. luego de alli, podemos descargar los fragmentos
            //!de manera aleatoria.
            //!y el mismo mediaSource auque se descargue de manera desordenada, este lo colocara en el tiempo que tiene
            //!que reproducirse
            /**
             * https://github.com/videojs/mux.js/#basic-usagen hecha un vistazo al codigo del paquete que usamos con este ejemplo basico
             */

            //?primero agregamos el fragmento inicial, osea la primera parte del video,
            //?e inicialmente ejecutamos el siguiente codigo, esto solo se tiene que ejecutar la primera vez
            //?por ser el primer fragmento
            //!Nota: este fragmetno de codigo, se puede volver a ejecutar cuando se cambia la resolucion
            //!de manera manual del video
            if (firstFragment) {
                let data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
                data.set(segment.initSegment, 0);
                data.set(segment.data, segment.initSegment.byteLength);
                await sourceBuffer.appendBuffer(data);//?agregamos los datos al buffer
                firstFragment = false//?evitamos que esto se ejecute una segunda vez
                return
            } else {
                //?los siguientes fragmentos, se pueden ir agragando solo pasando la "data" del "segment"
                await sourceBuffer.appendBuffer(new Uint8Array(segment.data));
            }


        }

        //? revisa si la funcion "_queue" tiene mas fragmentos por insertar
        async function _isThereFragments() {
            _emit("add")//?disparamos el evento "add" indicando que se agrego uno o varios fragmentos exitosamente
            await _insert() //?mandamos a llamar a insert, para que agregue los fragmentos restantes, en caso de que hallan mas almacenados
        }

        //?cuando se termina de agregar un fragmento al sourceBuffer, se activa esta funcion, para comprobar que ya se insertaron
        //? todos los fragmentos, y cerrar el flujo de datos(para indicar que no se agregaran mas datos)
        async function _closeStream() {
            //?para cerrar el flujo, se tienen que seguir ciertas pautas
            if (hlsElement.allFragmentsDownloaded) return//?si todos los fragmentos no han sido descargados, entonces no cerramos el flujo de datos
            if (mediaSource.readyState === "ended") return//?si el "readyState" es igual a "ended", eso quiere decir que ya se habia serrado el flujo, asi que no cerramos nuevamente el flujo(pues esto causaria un error)
            if (record.size !== hlsElement.totalFragments) return//?si la longitud del registro(record) es diferente a la cantidad total de fragmentos, eso quiere decir, que no se han descargados aun todos los fragmentos

            //?para cerrar el flujo, todos los elementos del "arrayBufferStorage8" ya debieron de haberse agregados al "sourceBuffer",
            //?de lo contrario al cerrar el buffer y luego querer insertar un fragmento este arrojara un error.
            //?[{buff:false, pos:0}, {buff:false, pos:1}, {buff:false, pos:2}](todos fueron consumidos, entonces cerramos el flujo)
            let result = arrayBufferStorage8.every(element => element.buff === false)
            if (result) {
                //?si todos los fragmentos ya se consumieron, procedemos a cerrar el flujo

                //?usamos un intervalo, ya que en ciertos casos cuando se intenta cerrar el flujo, hay fragmentos que aun se estan insertando
                //?por lo que comprobamos primero  si el "sourceBuffer" esta insertando datos(updating = true) o si ya no esta 
                //?insertando datos(updating=false), cuando el "updating" pasa a false, hasta ese momento cerramos el "mediaSource"
                let interval = setInterval(() => {
                    if (sourceBuffer.updating === true) return
                    mediaSource.endOfStream()
                    clearInterval(interval)
                }, hlsElement.timeSpace)

                hlsElement.allFragmentsDownloaded = true//?indicamos que todos los fragmentos ya fueron descargados
            }
        }

        //?cada que el usuario, adelante o retrase el video, este metodo, descargara el fragmento correspondiente a la 
        //?tiempo que el usuario elijio, y descargara sus fragmentos posteriores, en dado caso que no se han descargado
        let timeoutSearchFragment = 0
        async function _searchFragment() {
            //?este metodo usa un antirebote cada "hlsElement.timeSpace" segundos, esto para no sobre saturar la pila
            if (hlsElement.allFragmentsDownloaded) return//?si todos los fragmnetos ya han sido descargados, por logica no hace falta ir a buscar/descargar esos fragmentos

            clearTimeout(timeoutSearchFragment)
            timeoutSearchFragment = setTimeout(async () => {//?ya pasado el tiempo de espara ejecutamos el callback
                let indice = await _getIndex()//?obtenemos el indice del fragmento que se esta reproduciendo

                //?si el indice, ya se encuentra en el registro, o no se encontro retornamos, y no mandamos a descargar nada
                if (record.has(indice) || indice === -1) return
                await _downloadSeveralFragmentsAfter()//?descargamos los fragmentos
            }, hlsElement.timeSpace)
        }

        //?esta funcion se activa cada que el video.currentTime del video se actualiza o cambia
        //!Nota este evento se llega a ejecutar repetidas veces en un mismo segundo,
        //!por lo que se usa una estrategia de ejecutar el codigo ya pasado un segundo
        let lastTimeAutomaticDowload = new Date()
        async function _automaticDownload() {
            //?este fragmento de codigo, nos permite ejecutar el resto del codigo cada cierto tiempo, en este caso
            //?el tiempo seria en mili-segundos de "hlsElement.tipeSpace", es una especie de anti-rebote.
            let currentTime = new Date()
            if ((currentTime.getTime() - lastTimeAutomaticDowload.getTime()) <= hlsElement.timeSpace) return
            lastTimeAutomaticDowload = new Date()

            //?la funcion _getIndex, nos permite saber la posicion(indice) del fragmento que se esta reproduciendo
            let indice = await _getIndex()
            //?este fragmento, nos permite saber en que posicion del fragmento se esta reproduciendo, 
            //?si, la posicion del fragmento que anteriormente habiamos guardado, es diferente al indice del fragmento actual,
            //?entonces hubo un cambio, y lo actualizamos
            if (hlsElement.position !== indice) hlsElement.position = indice

            //?si, todos los fragmetnos ya fueron descargados, no mandamos a descargar nada
            if (hlsElement.allFragmentsDownloaded) return
            await _downloadSeveralFragmentsAfter()//?descargamos los fragmentos posteriores
        }

        //?si el tiempo actual del video es igual a la duracion total del video(osea que ha llegado al final),
        //?retornaremos un true
        //!Nota: este metodo, se ejecutara siempre y cuando, se llegue hasta el final y aun no se hallan descargado
        //! todos los fragmentos, por lo que debemos apoyrnos del evento "ended" de la etiqueta <video> para
        //!comprobar si el video a finalizado(se dispara cuando todos los fragmentos se han descargado y se ha terminado la reproduccion)
        async function _videoFinish() {
            //?si la duracion total del video es igual al tiempo actual del video, retornamos un true, en caso contrario un "undefined" que es por defecto
            if (hlsElement.videoDuration === parseInt(videoElement.currentTime)) {
                _emit("finish")//?disparamos el evento "finish" indicando que se llego hasta el final del video, pero que posiblemente no se descargaron todos los fragmentos del video
                return true
            }
        }

        //?este metodo, nos regresa el indice del fragmento actual del video, usando el <video>.currentTime
        async function _getIndex() {
            //?obtenemos el nombre de los fragmentos junto con la duracion de cada uno asi: [{"240p_000.ts":"10.001"}, {"240p_001.ts":"10.001"}]
            let fragments = hlsElement.files[hlsElement.currentResolutionPosition].files
            let contador = 0//?llevara la suma de los fragmentos de manera consecutiva.
            let indice = fragments.findIndex((element) => {//?nos regresara el indice del fragmento que se esta reproduciendo actualmente
                //?si la suma de los fragmentos, llega a ser mayor o igual al tiempo actual del video, entonces retornamos un true
                //?para obtener el indice, por ejemplo:
                //?si el video dura 60 segundos, y cada fragmento dura 10 segundos, y el usuario lo esta reproduciendo en el segundo
                //?37, la posocion del fragmento seria la posicion 3 asi:
                /**
                    0-10   0 
                    11-20  1
                    21-30  2
                    31-40  3//?en el ejemplo, el valor del "contador" tendria que ser de 40
                    41-50  4
                    51-60  5
                 */
                //!Nota: si la suma del contador fuese 30, no fuera suficiente, ya que cada fragmento tiene
                //!un rango de reproduccion, en este caso la posicion 3 abarca al tiempo 37. porque el rango de tiempo
                //!seria de los 31-40 segundos.
                contador += parseFloat(Object.values(element)[0])//?obtenemos la duracion de cada video asi: 10.001, 10.001, 3.001
                if (contador >= videoElement.currentTime) return true
            })
            //?retornamos el indice
            return indice
        }

        //?encargado de descargar el fragmento del tiempo actual(en caso que el usuario halla adelantato el video) 
        //?y fragmentos posteriores al fragmento que se esta reproduciendo
        /**ejem:
          imagina has descargado el fragmento 0 y para que no se detenga la reproduccion del video cuando este se 
          termine de reproducir, descargas una cantidad posterior para que no se congele el video.
          por defecto, se descarga N fragmentos(hlsElement.lastData) posteriores
         */
        async function _downloadSeveralFragmentsAfter() {
            let num = hlsElement.lastData//?la cantidad de fragmentos posteriores que se descargaran desde el fragmento actual
            let index = await _getIndex()//?obtenemos el indice del fragmento actual que se esta reproduciendo
            let nextFragments = [0]//?por defecto, siempre se intenta descargar el fragmento 0, esto para evitar descargar otros fragmentos y aun no han descargado el primero
            //?asi se descargaran los fragmentos: 
            //?primero: el fragmento 0 del video, por si aun no se ha descargado
            //?segundo el del tiempo actual(por si el usaurio adelanto el video, y aun no se ha descargado el fragmento), por eso, empezamos desde la posicion 0(i),
            //?tercero: la cantidad de fragmentos que se establecieron por defecto
            for (let i = 0; i <= num; i++) {
                if (index + i >= hlsElement.totalFragments) continue//?si el indice a descargar es mayor a la cantidad total de fragmentos, pasamos a la siguiente interacion
                //?si el indice no se encuentra en el registro, agregamos ese indice al arreglo "nextFragments" para que luego sea descargado
                if (!record.has(index + i)) nextFragments.push(index + i)
            }
            //?descargamos los fragmentos
            await _downloadFragment(nextFragments)
        }

        //?encargado de cambiar la resolucion del video a las calidades que este soporte.
        //?esta funcion tambien usa anti-rebote
        let timeoutChangeResolution = 0
        async function changeResolution(resolutionPosition) {//?recibe la posicion de la resolucion asi: 0(426x240'), 1('640x360'), ...
            clearTimeout(timeoutChangeResolution)
            timeoutChangeResolution = setTimeout(async () => {

                let position = parseInt(resolutionPosition)//?obtenemos la posicion: 0,1,2,...
                if (isNaN(position)) return//?si el valor no es un numero no cambiamos la resolucion
                if (!hlsElement.resolutions[position]) return//?si la resolucion no se encuentra no se cambia nada
                if (position === hlsElement.currentResolutionPosition) return//?si la posicion que se desea cambiar esta en uso, no hace falta ejecutar el resto del codigo, pues YA ESTA EN USO!


                let saveTime = parseInt(videoElement.currentTime)//?guardamos el tiempo en que se quedo reproduciendo el video, para luego reanudar desde ese tiempo con la nueva resolucion
                firstFragment = true//?indicamos, que se descargara el primer fragmento de la siguiente resolucion: ver el codigo de la funcion "_addFragment"
                hlsElement.currentResolutionPosition = position//?actualizamos la informacion de la resolucion del video a la que se ejecutara --> 0,1,2,...
                hlsElement.currentResolution = hlsElement.resolutions[position]//?actualizamos la informacion de la resolucion del video que se ejecutara --> '426x240', '640x360', '842x480', ...
                hlsElement.allFragmentsDownloaded = false//?indicamos que no se han descargado todos los fragmentos de la siguiente resolucion: ver: objeto hlsElement
                arrayBufferStorage8 = []//?reiniciamos el registro de los fragmentos consumidos, indicando que se descargaran nuevos fragmentos de la siguiente resolucion: ver el metodo "_queue()"
                record.clear()//?reiniciamos el registro, pues se descargaran nuevos fragmentos de una resolucion diferente

                //?guardamos la resolucion que al usuario eligio en el "localStorage", para que en el siguiente video
                //?se reprodusca en esa resolucion elegida.
                localStorage.setItem(hlsElement.keyQuality, hlsElement.currentResolution)

                //?lo siguiente que hacemos es liverar recursos

                //?eliminamos los listeners del sourceBuffer y videoElement
                sourceBuffer.removeEventListener('updateend', _isThereFragments);
                sourceBuffer.removeEventListener('updateend', _closeStream);

                //?el metodo abort() aborta cualquier operacion que haga el sourceBuffer, por ejemplo:
                //?si se esta agregando un fragmento puedes abortarlo, y si estas haciendo alguna  otra
                //?operacion con el sourceBuffer, esa operacion sera cancelada por este metodo.
                //?este metodo solo se ejecuta si el mediaSource esta todavia abierto.
                if (mediaSource.readyState === "open") sourceBuffer.abort();
                mediaSource.removeSourceBuffer(sourceBuffer)//?eliminamos el sourceBuffer del mediaSource

                videoElement.pause()//?pausamos el video
                videoElement.src = ""//?asignamos la ruta(src) del videoElement en nada
                if (mediaSource.readyState === "open") mediaSource.endOfStream()//?si el mediaSource sigue abierto, finalizamos el flujo de mas datos

                //?configura el valor de algunas variables antes de empezar a reproducir el video
                //?una vez terminado, se ejecuta el callback que nos pasan como parametro:
                //?ver la funcion "_init()" mas arriba.
                await _init(async (e) => {
                    _emit("change")//?disparamos el evento "change" cuando cambiemos la resolucion del video a otra
                    URL.revokeObjectURL(mediaSource)////?liberamos recursos, liberando el enlace del video y el mediaSource(esto no afecta la reproduccion y el resto del codigo)
                    sourceBuffer = mediaSource.addSourceBuffer(mime)//?creamos el sourceBuffer, indicandole que tipo de video reproducira, y los decodificadores que usara
                    sourceBuffer.addEventListener("updateend", _isThereFragments)//?cuando se termine de agregar un fragmento de video al "sourceBuffer", se activa el evento "updateend" y comprobara si hay mas fragmentos en la cola, para seguir insertandolos
                    sourceBuffer.addEventListener("updateend", _closeStream)//?cuando se termine de agregar un fragmento al "sourceBuffer" se activara el evento "updateend", comprobara si este es el ultimo fragmento, para cerrar el stream del video(significa que cerrara la entrada de mas datos)
                    mediaSource.duration = hlsElement.videoDuration//?indicamos cuanto es que duraba el video

                    //?si el tiempo que se guardo, es diferente al tiempo final del video(eso quiere decir, no se halla llegado al final del video todavia),
                    //?entonces, el video empezara a reproducirse desde donde se dejo en una resolucion diferente:
                    //?por ejemplo: si el video dura 1 minuto en total y se estaba reproduciendo en el segundo 20,
                    //?entonces en la siguiente resolucion, se empezara a reproducir desde el segundo 20.
                    //!Nota: en dado caso, que el video halla llegado a su fin, y se trate de cambiar la resolucion,
                    //!el video, comenzara desde el inicio, por eso no guardamos la posicion en la que antes se habia dejado,
                    //!copiando asi, el comportamiento de youtube, al finalizar el video y tratar de cambiar la resolucion,
                    //!se reproducira desde el primer fragmento/segmento del video
                    if (saveTime !== hlsElement.videoDuration) videoElement.currentTime = saveTime//?asignamos el tiempo en el que habia quedado el video, para luego reandarlo en ese tiempo con otra resolucion
                    //?descargamos los fragmentos correspondientes, en este caso, seria el primer fragmento del video,
                    //?segundo el fragmento correspondiente al tiempo actual del video, y los posteriores
                    await _downloadSeveralFragmentsAfter()

                })

            }, hlsElement.timeSpace);
        }



        // videoElement.add
        //!Aurelio, documenta y refactoriza el codigo

        document.getElementById("bt1").addEventListener('click', async (e) => {
            // console.log(sourceBuffer.buffered)
            // console.log('timeRanges: ', await getTimeRanes())
            _emit("add")
            // console.log("hlsElement: ", hlsElement)
            // console.log("mediaSource.readyState: ", mediaSource.readyState)
            // console.log("arrayBufferStorage8: ", arrayBufferStorage8)
            // console.log("velocity: ", hlsElement.velocity)
            // console.log('resolution: ', hlsElement.currentResolution)
            // console.log('position: ', hlsElement.currentResolutionPosition)
        })
        document.addEventListener('click', prueba)

        async function prueba(e) {
            if (e.target.matches("button.resolutions")) {
                console.log("superresoluciones------> ", e.target.getAttribute("pos"))
                await changeResolution(e.target.getAttribute("pos"))
            }
        }

        document.getElementById("bt2").addEventListener('click', async (e) => {
            console.log("resultado: ", await _getIndex())
        })

        async function getTimeRanges() {
            let buffered = sourceBuffer.buffered
            let timeRanges = []
            for (let i = 0; i < buffered.length; i++) {
                let start = buffered.start(i)
                let end = buffered.end(i)
                timeRanges.push([start, end])
            }
            return timeRanges
        }

        //* Eventos ********************************************************************************************
        //?este objeto almacenara todas las callbacks asociadas a un evento para luego ser ejecutadas una a una
        let obj = {
            "add": [],//?se dispara cuando se agrega uno o varios fragmentos
            "finish": [],//?se dispara cuando finaliza el video(pero no se desargaron todos los elementos)
            "download": [],//?se dispara cuando se descarga uno o varios fragmentos
            "change": [],//?se dispara cuando se cambia a un resolucion diferente
            "close": [],//?se dispara cuando se cierra el flujo de datos al sourceBuffer
            "ready": [],//?se dispara cuando el mediaSource esta listo para trabajar con el
            "errorconexion": [],//?se dispara cuando se perdio la conexion o no se esta recibiendo datos de la api o base de datos
            "successfulreconnection": [],//?se dispara despues de un evento de tipo "errorconexion", cuando se reanudo la conexion a la red o se conecto con la api o base de datos
        }

        //?este metodo, asociara las callbacks a un evento espefico, este metodo funciona igual que el metodo "on" de node.js
        function on(event, cb) {
            return new Promise((resolve, reject) => {
                
                if (typeof cb !== "function") return reject(`${cb} no es una funcion`)//?si la variable "cb" no es una funcion, entonces rechazamos la promesa
                if (!(event in obj)) return reject(`El evento ${event} no existe`)//?si el evento que se nos envia no existe rechazamos la promesa
                //?agregamos la callback al evento respectivo
                obj[event].push(cb)
                resolve(true)
            })
        }
        //?este es un metodo privado que solo puede ser accedido desde este script, y funciona para ejecutar todos los callbacks
        //?asociados a un evento
        async function _emit(event) {
        
            if (!(event in obj)) return//?si el evento no existe, no hacemos nada
            let callbacksArray = obj[event]//?obtenemos todas las callbacks registradas para un evento
            if(!callbacksArray.length) return//?si no hay ninguna callback a ejecutar, no hacemos nada
            for (let i = 0; i < callbacksArray.length; i++) {//?ejecutamos las callbacks una a una(termina una, se ejecuta la otra)
                let cb = callbacksArray[i]//?obtenemos el callback individual

                //?usamos await, en un dado caso que sea una funcion asincrona, luego de eso, usamos el try-catch, para impedir
                //?que las demas funciones no se ejecuten si falla la anterior
                try {
                    await cb()
                } catch (err) {
                    console.error(`tuvimos problemas al ejecutar la funcion:\n${cb}\n, trata de manejar los errores al usar la funcion 'on("event", cb)'`)
                }
            }
        }

        return {hlsElement, on, volume, getTimeRanges, changeResolution}

    } catch (err) {
        alert(`error: ${err}`)
    }

}

export default start