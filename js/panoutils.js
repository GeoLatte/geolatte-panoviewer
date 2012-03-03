
/*
An mixin function. Mixes all properties/methods of the second to last argument objects into the
first argument object.
*/
function PanoMixin(){
   var arg, prop;
   var destination = arguments[0];
   for (arg = 1; arg < arguments.length; arg += 1){
      for (prop in arguments[arg]){
         if (arguments[arg].hasOwnProperty(prop)){
            destination[prop] = arguments[arg][prop];
         }
      }
   }
}

function PanoEvents(/* array of event types (as strings)*/ eventTypes) {
   var eventType, idx;
   //create a map with event name as key and an array of listeners as value 
   var listeners = {};	
   for ( idx = 0; idx < eventTypes.length; idx += 1){
      eventType = eventTypes[idx];
      listeners[eventType] = [];
   }
   return {
     /* Registers the event listener for event type ev. */
     on : function (ev, listener) { 
            listeners[ev].push(listener);
     },     
     /* fires the event listeners for event type ev. */
     fireEvent: function (typeEvent, ev) {
            var i = listeners[typeEvent].length;
            while(i--){
                listeners[typeEvent][i].call(this, ev);
            }
      }
   }; 
}

function PanoXYPositioner (viewer1, pos1, viewer2, pos2){

   var EPSILON = Math.PI * 5 / 180; //minimum of 5 degrees angle between the lines 	
   var toRadians = function(degrees){
      return Math.PI * degrees / 180;
   };
   var findIntersection = function(p0, d0, p1, d1){
      var e,s, t, sqrKross, kross, sqrLen0, sqrLen1;
      e = {x : p1.x - p0.x, y: p1.y - p0.y};
      kross = d0.x * d1.y - d0.y*d1.x;
      //var sqrLen0 = d0.x*d0.x + d0.y*d0.y; === garuanteed to be 1
      //var sqrLen1 = d1.x*d1.x + d1.y*d1.y;
      sqrKross = kross*kross;		
      if (sqrKross > EPSILON) {
         s = (e.x * d1.y - e.y*d1.x) / kross;			
         t = (e.x * d0.y - e.y*d0.x) / kross;
         if (s > 0 && t > 0) {
            return {x: p0.x + s*d0.x, y: p0.y + s*d0.y};
         }			
      }
      return null;
   };	
   var createListener = function(viewer){
      return function(bearing){
         if(viewer === viewers[0]) {
            positions[0].yaw = bearing.yaw;				
         } else if (viewer === viewers[1]){
            positions[1].yaw = bearing.yaw;
         }
         self.updateIntersection();
      }
   };
   viewer1.on('bearing-registered', createListener(viewer1));
   viewer2.on('bearing-registered', createListener(viewer2));	
	
   var viewers = [];
   var positions = [];
   viewers.push(viewer1);
   viewers.push(viewer2);
   positions.push(pos1);
   positions.push(pos2);
   var self;
   self = {
      intersection: null,
      updateIntersection: function(){
         if (!positions[0].yaw || !positions[1].yaw) return;
         var p0 = positions[0];
         var d0 = {x: Math.sin(toRadians(positions[0].yaw)),
                   y: Math.cos(toRadians(positions[0].yaw))};
         var p1 = positions[1];
         var d1 = {x: Math.sin(toRadians(positions[1].yaw)),
                   y: Math.cos(toRadians(positions[1].yaw))};						 
			
         self.intersection = findIntersection(p0, d0, p1, d1);         
         self.fireEvent('intersection-updated', self.intersection ? self.intersection : {});
      }
   };
   PanoMixin(self, new PanoEvents(['intersection-updated']));
   return self;	
}