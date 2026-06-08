---
title: TCP vs UDP Networking
type: atomic
source: 
domain: Computer Science
topic: Networking
tags: [TCP, UDP, Protocols, Networking]
created: 2026-05-30
updated: 2026-05-30
---

## Source Facts
*   **TCP Connection Establishment:**
    *   Uses a three-way handshake consisting of SYN, SYN-ACK, and ACK.
*   **TCP Reliability:**
    *   Guarantees ordered and reliable delivery of data.
    *   Achieves reliability through sequence numbers and acknowledgements.
    *   Utilizes congestion control mechanisms such as slow start and AIMD.
*   **UDP Characteristics:**
    *   Is connectionless.
    *   Is unreliable in delivery.

## Synthesis
The primary difference between TCP and UDP lies in their service guarantees and overhead. TCP prioritizes reliability and order via complex mechanisms (handshaking, sequence tracking, congestion control), making it suitable where data integrity is paramount. Conversely, UDP sacrifices these guarantees for performance, operating in a lightweight, connectionless manner, making it ideal for real-time applications where speed is more critical than absolute reliability.

## Connections
## Speculation
## Open Questions
*   The note does not specify which application layer protocols typically utilize UDP versus TCP, or the performance trade-offs for specific use cases.

## Human Insight