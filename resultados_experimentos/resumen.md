# Ablación: perfil «articulo» frente a «mejorado»

Semilla 42. Objetivos de dos niveles. «éxito»: tasa de éxito prescriptivo del FCM (% que llega al mejor nivel);
«bosque»: % que un bosque aleatorio independiente clasifica en el mejor nivel; «rec.»: reconstrucción de las acciones
de los registros de prueba que ya están en el mejor nivel (escala [0, 1]; PSR de la ec. 19 = suma prescrita / suma real).

| Dataset | Perfil | Método | Regla elegida | Exactitud | F1 | Éxito | Bosque | Rec. MAE | Rec. RMSE | R² | PSR ec. 19 | s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| xapi480 | articulo | pso | kosko, sigmoide, λ 2 | 76.0 % | 74.0 % | 14.6 → 9.8 % | 17.1 → 9.8 % | 0.422 | 0.505 | -2.48 | 1.22 | 94 |
| xapi480 | articulo | bptt | kosko, sigmoide, λ 10 | 83.6 % | 80.5 % | 19.5 → 12.2 % | 17.1 → 7.3 % | 0.393 | 0.481 | -2.13 | 1.14 | 91 |
| xapi480 | articulo | ridge | kosko_modificada, sigmoide, λ 2 | 81.5 % | 79.4 % | 12.2 → 95.1 % | 17.1 → 65.9 % | 0.377 | 0.468 | -1.97 | 1.22 | 15 |
| xapi480 | mejorado | pso | kosko_modificada, sigmoide, λ 2 | 87.7 % | 85.4 % | 14.6 → 29.3 % | 17.1 → 39.0 % | 0.453 | 0.535 | -2.92 | 1.83 | 12 |
| xapi480 | mejorado | bptt | kosko_modificada, sigmoide, λ 3 | 87.7 % | 85.5 % | 12.2 → 34.1 % | 17.1 → 48.8 % | 0.453 | 0.535 | -2.92 | 1.83 | 9 |
| xapi480 | mejorado | ridge | kosko_modificada, sigmoide, λ 3 | 88.4 % | 86.4 % | 9.8 → 17.1 % | 17.1 → 36.6 % | 0.453 | 0.535 | -2.92 | 1.83 | 3 |
| xapi4800 | mejorado | pso | kosko_modificada, sigmoide, λ 3 | 89.7 % | 85.8 % | 22.7 → 39.7 % | 2.1 → 21.2 % | 0.439 | 0.498 | -4.29 | 1.38 | 121 |
| xapi4800 | mejorado | bptt | kosko_modificada, sigmoide, λ 5 | 94.2 % | 92.2 % | 3.6 → 6.7 % | 2.1 → 8.5 % | 0.455 | 0.513 | -4.61 | 1.83 | 31 |
| xapi4800 | mejorado | ridge | kosko_modificada, sigmoide, λ 5 | 94.5 % | 92.2 % | 1.2 → 8.5 % | 2.1 → 7.6 % | 0.455 | 0.513 | -4.61 | 1.83 | 14 |
| marketing | articulo | pso | reescalada, sigmoide, λ 3 | 76.1 % | 65.7 % | 22.2 → 70.0 % | 1.4 → 2.1 % | 0.385 | 0.487 | -16.57 | 2.46 | 2615 |
| marketing | articulo | bptt | reescalada, sigmoide, λ 5 | 85.0 % | 46.0 % | 0.0 → 0.0 % | 1.4 → 3.3 % | 0.371 | 0.452 | -14.50 | 2.65 | 358 |
| marketing | articulo | ridge | reescalada, sigmoide, λ 1 | 88.7 % | 71.5 % | 2.1 → 24.4 % | 1.4 → 2.4 % | 0.377 | 0.475 | -12.80 | 2.59 | 44 |
| marketing | mejorado | pso | kosko_modificada, sigmoide, λ 2 | 88.4 % | 73.2 % | 3.7 → 5.6 % | 1.4 → 1.4 % | 0.349 | 0.459 | -18.56 | 1.30 | 40 |
| marketing | mejorado | bptt | kosko_modificada, sigmoide, λ 2 | 88.9 % | 74.4 % | 3.5 → 42.9 % | 1.4 → 1.7 % | 0.808 | 0.818 | -49.00 | 5.20 | 26 |
| marketing | mejorado | ridge | kosko_modificada, sigmoide, λ 3 | 88.4 % | 70.0 % | 1.9 → 49.6 % | 1.4 → 1.7 % | 0.808 | 0.818 | -49.00 | 5.20 | 11 |
| heart | articulo | pso | kosko_modificada, sigmoide, λ 1 | 81.1 % | 81.1 % | 11.9 → 16.7 % | 11.9 → 11.9 % | 0.388 | 0.456 | -13.22 | 1.27 | 43 |
| heart | articulo | bptt | kosko, sigmoide, λ 1 | 86.7 % | 86.7 % | 9.5 → 11.9 % | 11.9 → 9.5 % | 0.379 | 0.444 | -11.74 | 0.85 | 28 |
| heart | articulo | ridge | kosko, sigmoide, λ 3 | 84.4 % | 84.4 % | 16.7 → 33.3 % | 11.9 → 14.3 % | 0.403 | 0.479 | -14.50 | 1.59 | 6 |
| heart | mejorado | pso | kosko_modificada, sigmoide, λ 1 | 87.8 % | 87.7 % | 11.9 → 11.9 % | 11.9 → 11.9 % | 0.528 | 0.588 | -24.19 | 1.82 | 6 |
| heart | mejorado | bptt | kosko_modificada, sigmoide, λ 0.5 | 86.7 % | 86.6 % | 14.3 → 14.3 % | 11.9 → 11.9 % | 0.275 | 0.304 | -4.82 | 0.00 | 20 |
| heart | mejorado | ridge | kosko_modificada, sigmoide, λ 1 | 85.6 % | 85.5 % | 11.9 → 14.3 % | 11.9 → 11.9 % | 0.275 | 0.304 | -4.82 | 0.00 | 2 |
| desercion | articulo | pso | kosko_modificada, sigmoide, λ 10 | 84.7 % | 45.9 % | 100.0 → 100.0 % | 43.3 → 46.7 % | 0.379 | 0.458 | -1.50 | 1.13 | 1011 |
| desercion | articulo | bptt | reescalada, sigmoide, λ 2 | 89.8 % | 82.2 % | 13.3 → 13.3 % | 43.3 → 46.7 % | 0.429 | 0.527 | -2.31 | 1.47 | 178 |
| desercion | articulo | ridge | reescalada, sigmoide, λ 2 | 89.8 % | 83.0 % | 13.3 → 10.0 % | 43.3 → 46.7 % | 0.383 | 0.480 | -1.74 | 1.19 | 41 |
| desercion | mejorado | pso | kosko_modificada, sigmoide, λ 3 | 85.2 % | 63.6 % | 73.3 → 73.3 % | 43.3 → 43.3 % | 0.637 | 0.699 | -4.82 | 2.75 | 12 |
| desercion | mejorado | bptt | kosko_modificada, sigmoide, λ 5 | 90.3 % | 77.8 % | 13.3 → 13.3 % | 43.3 → 43.3 % | 0.363 | 0.465 | -1.57 | 0.00 | 8 |
| desercion | mejorado | ridge | kosko_modificada, sigmoide, λ 3 | 88.3 % | 70.0 % | 66.7 → 66.7 % | 43.3 → 43.3 % | 0.363 | 0.465 | -1.57 | 0.00 | 3 |

## Reconstrucción por acción (Tablas 11 y 12)

| Dataset | Perfil | Método | Acción | MAE | MSE | RMSE | Real (media ± DE) | Prescrita (media ± DE) | Prueba | p |
|---|---|---|---|---|---|---|---|---|---|---|
| xapi480 | articulo | pso | raisedhands | 0.4293 | 0.2507 | 0.5007 | 0.561 ± 0.270 | 0.650 ± 0.408 | wilcoxon | 0.066 |
| xapi480 | articulo | pso | VisITedResources | 0.3455 | 0.2043 | 0.4520 | 0.681 ± 0.277 | 0.668 ± 0.432 | wilcoxon | 0.511 |
| xapi480 | articulo | pso | AnnouncementsView | 0.4621 | 0.2827 | 0.5317 | 0.456 ± 0.255 | 0.686 ± 0.454 | wilcoxon | 0.000 |
| xapi480 | articulo | pso | Discussion | 0.4517 | 0.2836 | 0.5325 | 0.490 ± 0.292 | 0.664 ± 0.432 | wilcoxon | 0.001 |
| xapi480 | articulo | bptt | raisedhands | 0.4111 | 0.2473 | 0.4972 | 0.561 ± 0.270 | 0.709 ± 0.405 | wilcoxon | 0.001 |
| xapi480 | articulo | bptt | VisITedResources | 0.2976 | 0.1582 | 0.3977 | 0.681 ± 0.277 | 0.705 ± 0.413 | wilcoxon | 0.167 |
| xapi480 | articulo | bptt | AnnouncementsView | 0.4019 | 0.2272 | 0.4766 | 0.456 ± 0.255 | 0.616 ± 0.430 | wilcoxon | 0.000 |
| xapi480 | articulo | bptt | Discussion | 0.4602 | 0.2920 | 0.5404 | 0.490 ± 0.292 | 0.476 ± 0.445 | wilcoxon | 0.694 |
| xapi480 | articulo | ridge | raisedhands | 0.3985 | 0.2268 | 0.4762 | 0.561 ± 0.270 | 0.772 ± 0.392 | wilcoxon | 0.000 |
| xapi480 | articulo | ridge | VisITedResources | 0.2811 | 0.1403 | 0.3745 | 0.681 ± 0.277 | 0.900 ± 0.211 | wilcoxon | 0.000 |
| xapi480 | articulo | ridge | AnnouncementsView | 0.3990 | 0.2344 | 0.4841 | 0.456 ± 0.255 | 0.629 ± 0.432 | wilcoxon | 0.000 |
| xapi480 | articulo | ridge | Discussion | 0.4279 | 0.2740 | 0.5234 | 0.490 ± 0.292 | 0.376 ± 0.425 | wilcoxon | 0.017 |
| xapi480 | mejorado | pso | raisedhands | 0.4386 | 0.2645 | 0.5143 | 0.561 ± 0.270 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi480 | mejorado | pso | VisITedResources | 0.3186 | 0.1773 | 0.4211 | 0.681 ± 0.277 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi480 | mejorado | pso | AnnouncementsView | 0.5441 | 0.3606 | 0.6005 | 0.456 ± 0.255 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi480 | mejorado | pso | Discussion | 0.5097 | 0.3441 | 0.5866 | 0.490 ± 0.292 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi480 | mejorado | bptt | raisedhands | 0.4386 | 0.2645 | 0.5143 | 0.561 ± 0.270 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi480 | mejorado | bptt | VisITedResources | 0.3186 | 0.1773 | 0.4211 | 0.681 ± 0.277 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi480 | mejorado | bptt | AnnouncementsView | 0.5441 | 0.3606 | 0.6005 | 0.456 ± 0.255 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi480 | mejorado | bptt | Discussion | 0.5097 | 0.3441 | 0.5866 | 0.490 ± 0.292 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi480 | mejorado | ridge | raisedhands | 0.4386 | 0.2645 | 0.5143 | 0.561 ± 0.270 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi480 | mejorado | ridge | VisITedResources | 0.3186 | 0.1773 | 0.4211 | 0.681 ± 0.277 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi480 | mejorado | ridge | AnnouncementsView | 0.5441 | 0.3606 | 0.6005 | 0.456 ± 0.255 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi480 | mejorado | ridge | Discussion | 0.5097 | 0.3441 | 0.5866 | 0.490 ± 0.292 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | pso | raisedhands | 0.4335 | 0.2404 | 0.4903 | 0.567 ± 0.229 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | pso | VisITedResources | 0.3070 | 0.1384 | 0.3720 | 0.693 ± 0.210 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | pso | AnnouncementsView | 0.5477 | 0.3445 | 0.5870 | 0.452 ± 0.211 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | pso | Discussion | 0.4696 | 0.2673 | 0.5171 | 0.470 ± 0.217 | 0.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | bptt | raisedhands | 0.4335 | 0.2404 | 0.4903 | 0.567 ± 0.229 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | bptt | VisITedResources | 0.3070 | 0.1384 | 0.3720 | 0.693 ± 0.210 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | bptt | AnnouncementsView | 0.5477 | 0.3445 | 0.5870 | 0.452 ± 0.211 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | bptt | Discussion | 0.5304 | 0.3282 | 0.5729 | 0.470 ± 0.217 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | ridge | raisedhands | 0.4335 | 0.2404 | 0.4903 | 0.567 ± 0.229 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | ridge | VisITedResources | 0.3070 | 0.1384 | 0.3720 | 0.693 ± 0.210 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | ridge | AnnouncementsView | 0.5477 | 0.3445 | 0.5870 | 0.452 ± 0.211 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| xapi4800 | mejorado | ridge | Discussion | 0.5304 | 0.3282 | 0.5729 | 0.470 ± 0.217 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | articulo | pso | NumDealsPurchases | 0.4975 | 0.3540 | 0.5950 | 0.163 ± 0.144 | 0.610 ± 0.371 | wilcoxon | 0.000 |
| marketing | articulo | pso | NumCatalogPurchases | 0.3339 | 0.1956 | 0.4422 | 0.153 ± 0.105 | 0.423 ± 0.361 | wilcoxon | 0.000 |
| marketing | articulo | pso | NumWebPurchases | 0.4438 | 0.2869 | 0.5357 | 0.187 ± 0.100 | 0.544 ± 0.383 | wilcoxon | 0.000 |
| marketing | articulo | pso | NumWebVisitsMonth | 0.2633 | 0.1111 | 0.3333 | 0.266 ± 0.136 | 0.317 ± 0.344 | wilcoxon | 0.651 |
| marketing | articulo | bptt | NumDealsPurchases | 0.3768 | 0.2069 | 0.4548 | 0.163 ± 0.144 | 0.507 ± 0.279 | wilcoxon | 0.000 |
| marketing | articulo | bptt | NumCatalogPurchases | 0.4103 | 0.2445 | 0.4945 | 0.153 ± 0.105 | 0.539 ± 0.302 | wilcoxon | 0.000 |
| marketing | articulo | bptt | NumWebPurchases | 0.3789 | 0.2071 | 0.4551 | 0.187 ± 0.100 | 0.518 ± 0.291 | wilcoxon | 0.000 |
| marketing | articulo | bptt | NumWebVisitsMonth | 0.3171 | 0.1572 | 0.3965 | 0.266 ± 0.136 | 0.473 ± 0.323 | wilcoxon | 0.000 |
| marketing | articulo | ridge | NumDealsPurchases | 0.5455 | 0.3943 | 0.6280 | 0.163 ± 0.144 | 0.681 ± 0.378 | wilcoxon | 0.000 |
| marketing | articulo | ridge | NumCatalogPurchases | 0.2483 | 0.1204 | 0.3470 | 0.153 ± 0.105 | 0.330 ± 0.351 | wilcoxon | 0.000 |
| marketing | articulo | ridge | NumWebPurchases | 0.2213 | 0.0793 | 0.2816 | 0.187 ± 0.100 | 0.254 ± 0.263 | wilcoxon | 0.118 |
| marketing | articulo | ridge | NumWebVisitsMonth | 0.4932 | 0.3102 | 0.5569 | 0.266 ± 0.136 | 0.729 ± 0.334 | wilcoxon | 0.000 |
| marketing | mejorado | pso | NumDealsPurchases | 0.1630 | 0.0470 | 0.2169 | 0.163 ± 0.144 | 0.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | mejorado | pso | NumCatalogPurchases | 0.1535 | 0.0345 | 0.1857 | 0.153 ± 0.105 | 0.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | mejorado | pso | NumWebPurchases | 0.8130 | 0.6708 | 0.8190 | 0.187 ± 0.100 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | mejorado | pso | NumWebVisitsMonth | 0.2658 | 0.0890 | 0.2984 | 0.266 ± 0.136 | 0.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | mejorado | bptt | NumDealsPurchases | 0.8370 | 0.7210 | 0.8491 | 0.163 ± 0.144 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | mejorado | bptt | NumCatalogPurchases | 0.8465 | 0.7276 | 0.8530 | 0.153 ± 0.105 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | mejorado | bptt | NumWebPurchases | 0.8130 | 0.6708 | 0.8190 | 0.187 ± 0.100 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | mejorado | bptt | NumWebVisitsMonth | 0.7342 | 0.5574 | 0.7466 | 0.266 ± 0.136 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | mejorado | ridge | NumDealsPurchases | 0.8370 | 0.7210 | 0.8491 | 0.163 ± 0.144 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | mejorado | ridge | NumCatalogPurchases | 0.8465 | 0.7276 | 0.8530 | 0.153 ± 0.105 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | mejorado | ridge | NumWebPurchases | 0.8130 | 0.6708 | 0.8190 | 0.187 ± 0.100 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| marketing | mejorado | ridge | NumWebVisitsMonth | 0.7342 | 0.5574 | 0.7466 | 0.266 ± 0.136 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| heart | articulo | pso | trestbps | 0.3413 | 0.1463 | 0.3825 | 0.304 ± 0.138 | 0.199 ± 0.322 | wilcoxon | 0.050 |
| heart | articulo | pso | chol | 0.4341 | 0.2687 | 0.5184 | 0.247 ± 0.115 | 0.503 ± 0.432 | wilcoxon | 0.002 |
| heart | articulo | bptt | trestbps | 0.3983 | 0.2041 | 0.4518 | 0.304 ± 0.138 | 0.182 ± 0.384 | wilcoxon | 0.040 |
| heart | articulo | bptt | chol | 0.3595 | 0.1895 | 0.4353 | 0.247 ± 0.115 | 0.284 ± 0.440 | wilcoxon | 0.882 |
| heart | articulo | ridge | trestbps | 0.3594 | 0.1840 | 0.4290 | 0.304 ± 0.138 | 0.332 ± 0.422 | wilcoxon | 0.963 |
| heart | articulo | ridge | chol | 0.4469 | 0.2756 | 0.5250 | 0.247 ± 0.115 | 0.542 ± 0.446 | wilcoxon | 0.000 |
| heart | mejorado | pso | trestbps | 0.3037 | 0.1108 | 0.3329 | 0.304 ± 0.138 | 0.000 ± 0.000 | wilcoxon | 0.000 |
| heart | mejorado | pso | chol | 0.7529 | 0.5799 | 0.7615 | 0.247 ± 0.115 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| heart | mejorado | bptt | trestbps | 0.3037 | 0.1108 | 0.3329 | 0.304 ± 0.138 | 0.000 ± 0.000 | wilcoxon | 0.000 |
| heart | mejorado | bptt | chol | 0.2471 | 0.0741 | 0.2722 | 0.247 ± 0.115 | 0.000 ± 0.000 | wilcoxon | 0.000 |
| heart | mejorado | ridge | trestbps | 0.3037 | 0.1108 | 0.3329 | 0.304 ± 0.138 | 0.000 ± 0.000 | wilcoxon | 0.000 |
| heart | mejorado | ridge | chol | 0.2471 | 0.0741 | 0.2722 | 0.247 ± 0.115 | 0.000 ± 0.000 | wilcoxon | 0.000 |
| desercion | articulo | pso | Study_Time | 0.3787 | 0.2100 | 0.4583 | 0.363 ± 0.291 | 0.411 ± 0.359 | wilcoxon | 0.104 |
| desercion | articulo | bptt | Study_Time | 0.4286 | 0.2781 | 0.5273 | 0.363 ± 0.291 | 0.536 ± 0.428 | wilcoxon | 0.000 |
| desercion | articulo | ridge | Study_Time | 0.3825 | 0.2304 | 0.4800 | 0.363 ± 0.291 | 0.431 ± 0.415 | wilcoxon | 0.064 |
| desercion | mejorado | pso | Study_Time | 0.6365 | 0.4893 | 0.6995 | 0.363 ± 0.291 | 1.000 ± 0.000 | wilcoxon | 0.000 |
| desercion | mejorado | bptt | Study_Time | 0.3635 | 0.2162 | 0.4650 | 0.363 ± 0.291 | 0.000 ± 0.000 | wilcoxon | 0.000 |
| desercion | mejorado | ridge | Study_Time | 0.3635 | 0.2162 | 0.4650 | 0.363 ± 0.291 | 0.000 ± 0.000 | wilcoxon | 0.000 |
